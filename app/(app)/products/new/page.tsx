import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "../../../../lib/auth/session";
import { getShopProfile } from "../../../../lib/repositories/shop";
import { ProductForm } from "../../../../components/product-form";
import { Alert, Card, CardHeader, PageHeader } from "../../../../components/ui";

export const metadata: Metadata = { title: "Add product" };

export default async function NewProductPage() {
  const user = await requireUser();
  const shop = await getShopProfile(user.id);

  return (
    <div>
      <div className="mb-4">
        <Link href="/products" className="text-sm font-medium text-ink-500 hover:text-ink-900">
          ← Back to products
        </Link>
      </div>

      <PageHeader
        title="Add product"
        description="A name, a price and one clear photo is all you need to start."
      />

      {!shop?.shop_slug ? (
        <div className="mb-5">
          <Alert tone="warn">
            Your shop link is not set up yet, so this product will not be publicly visible.{" "}
            <Link href="/my-shop" className="font-semibold underline">
              Set up My Shop
            </Link>
          </Alert>
        </div>
      ) : null}

      <Card>
        <CardHeader title="Product details" />
        <div className="px-5 py-5">
          <ProductForm />
        </div>
      </Card>
    </div>
  );
}
