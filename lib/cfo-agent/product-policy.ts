import { isDummyStock } from './calculations';
import type { Row } from './sources';
export function productPolicy(product:Row|undefined) {
  const text=String(product?.privateNote??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').toUpperCase();
  // Deliberately narrow: unstructured notebook instructions are not executable policy.
  const noReorder=/(?:CFO_POLICY:NO_REORDER|YENIDEN SIPARIS VERILMEZ|BIR DAHA ALINMAYACAK|TEKRAR SIPARIS VERILMEYECEK)/.test(text);
  const virtual=product?.kind==='LISTING_PACKAGE'||(product?.stock!=null&&isDummyStock(Number(product.stock)));
  return {noReorder,virtual,procurementAllowed:product?.active!==false&&!noReorder&&!virtual,
    policySource:noReorder?'Product.privateNote':virtual?'Product.kind_or_verified_dummy_stock':null};
}
