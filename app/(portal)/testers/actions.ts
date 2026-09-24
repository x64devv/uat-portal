'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db, testerByEmail } from '@/lib/db';

const back = (msg: string, ok = false) => redirect(`/testers?ok=${ok ? 1 : 0}&msg=${encodeURIComponent(msg)}`);

/**
 * Add a tester. ⚠ Nobody is ever deleted: their results point at them. Removing somebody means
 * deactivating them, which locks them out on their next click and keeps every result they recorded.
 */
export async function addTesterAction(form: FormData): Promise<void> {
  const me = await requireAdmin();
  const name = String(form.get('name') ?? '').trim();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const isAdmin = form.get('is_admin') === 'on';

  if (!name) back('Give the tester a name — it is what appears beside every result they record.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back('That does not look like an email address.');

  const existing = await testerByEmail(email);
  if (existing) {
    back(existing.active ? `${email} is already a tester.` : `${email} is already on the list, deactivated. Reactivate them below.`);
  }

  const { error } = await db().from('uat_testers').insert({ name, email, is_admin: isAdmin, added_by: me.email });
  if (error) back(`Could not add: ${error.message}`);
  revalidatePath('/testers');
  back(`Added ${name}. They sign in at this portal's address with ${email}.`, true);
}

export async function setActiveAction(form: FormData): Promise<void> {
  const me = await requireAdmin();
  const id = String(form.get('id') ?? '');
  const active = form.get('active') === '1';
  // ⚠ An administrator cannot lock themselves out: with no other administrator that would leave
  // nobody able to add testers, and fixing it would need the database dashboard.
  if (id === me.id && !active) back('You cannot deactivate yourself.');
  const { error } = await db().from('uat_testers').update({ active }).eq('id', id);
  if (error) back(`Could not update: ${error.message}`);
  revalidatePath('/testers');
  back(active ? 'Reactivated.' : 'Deactivated. Their results stay; they can no longer sign in.', true);
}

export async function setAdminAction(form: FormData): Promise<void> {
  const me = await requireAdmin();
  const id = String(form.get('id') ?? '');
  const isAdmin = form.get('is_admin') === '1';
  if (id === me.id && !isAdmin) back('You cannot remove your own administrator rights.');
  const { error } = await db().from('uat_testers').update({ is_admin: isAdmin }).eq('id', id);
  if (error) back(`Could not update: ${error.message}`);
  revalidatePath('/testers');
  back('Updated.', true);
}
