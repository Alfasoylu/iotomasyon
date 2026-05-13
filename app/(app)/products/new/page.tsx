import { Card } from "@/components/ui/card";
import { ProductForm } from "@/components/products/product-form";

export default function NewProductPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          Products
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Yeni urun olustur
        </h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          SKU, stok ve lokasyon bilgilerini kaydederek envanteri aratilabilir hale getirin.
        </p>
      </div>

      <Card className="p-6">
        <ProductForm mode="create" />
      </Card>
    </div>
  );
}
