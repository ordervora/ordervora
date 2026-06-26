import { notFound } from 'next/navigation';

import { getServerClient } from '@/lib/supabase/server';
import { restaurantService } from '@/lib/services';
import { AccountClient } from '@/components/customer/AccountClient';

/**
 * Account hub page. Loads the restaurant for branding + loyalty config and
 * renders the account client, which gates on auth state itself.
 */
export default async function AccountPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await getServerClient();

  const result = await restaurantService.getRestaurantBySlug(client, slug);
  if (result.error || !result.data) {
    notFound();
  }

  return <AccountClient restaurant={result.data} />;
}
