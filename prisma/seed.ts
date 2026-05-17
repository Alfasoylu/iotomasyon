/**
 * IOTOMASYON — Phase 5 RBAC Seed
 *
 * Inserts system roles, all permission keys, and default RolePermission assignments.
 *
 * Rules:
 * - All operations are upsert — idempotent, safe to re-run any number of times.
 * - System roles (isSystem=true) cannot be deleted via admin UI.
 * - CUSTOM role intentionally has no RolePermission rows (fully manual via UserPermission).
 * - Dangerous permissions (migrations.approve, destructiveActions.approve) are registered
 *   in the Permission table but are NEVER added to any RolePermission row.
 *
 * Run:
 *   npx prisma db seed
 *   (or via: npm run db:seed)
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? "",
});
const prisma = new PrismaClient({ adapter });

// ── System roles ────────────────────────────────────────────────────────────
// key must match UserRole enum values in schema.prisma exactly.

const SYSTEM_ROLES = [
  { key: "ADMIN",                name: "Admin",                  isSystem: true },
  { key: "SALES",                name: "Satış",                  isSystem: true },
  { key: "OPERATIONS",           name: "Operasyon",              isSystem: true },
  { key: "WAREHOUSE",            name: "Depo",                   isSystem: true },
  { key: "MARKETPLACE_OPERATOR", name: "Pazar Yeri Operatörü",   isSystem: true },
  { key: "CUSTOM",               name: "Özel Rol",               isSystem: true },
] as const;

// ── Permission registry ──────────────────────────────────────────────────────
// Dangerous permissions are registered here but never placed in RolePermission.

const PERMISSIONS = [
  // User management
  { key: "users.read",                  name: "Kullanıcı Görüntüleme",           category: "users" },
  { key: "users.create",                name: "Kullanıcı Oluşturma",             category: "users" },
  { key: "users.update",                name: "Kullanıcı Düzenleme",             category: "users" },
  { key: "users.disable",               name: "Kullanıcı Devre Dışı Bırakma",   category: "users" },
  { key: "users.resetPassword",         name: "Şifre Sıfırlama",                category: "users" },
  { key: "permissions.manage",          name: "İzin Yönetimi",                   category: "users" },

  // Customers
  { key: "customers.read",              name: "Müşteri Görüntüleme",             category: "customers" },
  { key: "customers.create",            name: "Müşteri Oluşturma",               category: "customers" },
  { key: "customers.update",            name: "Müşteri Düzenleme",               category: "customers" },
  { key: "customers.delete",            name: "Müşteri Silme",                   category: "customers" },

  // Products
  { key: "products.read",               name: "Ürün Görüntüleme",                category: "products" },
  { key: "products.create",             name: "Ürün Oluşturma",                  category: "products" },
  { key: "products.update",             name: "Ürün Düzenleme",                  category: "products" },
  { key: "products.delete",             name: "Ürün Silme",                      category: "products" },

  // Categories
  { key: "categories.read",             name: "Kategori Görüntüleme",            category: "categories" },
  { key: "categories.create",           name: "Kategori Oluşturma",              category: "categories" },
  { key: "categories.update",           name: "Kategori Düzenleme",              category: "categories" },
  { key: "categories.delete",           name: "Kategori Silme",                  category: "categories" },

  // Attributes
  { key: "attributes.read",             name: "Özellik Görüntüleme",             category: "attributes" },
  { key: "attributes.create",           name: "Özellik Oluşturma",               category: "attributes" },
  { key: "attributes.update",           name: "Özellik Düzenleme",               category: "attributes" },
  { key: "attributes.delete",           name: "Özellik Silme",                   category: "attributes" },

  // Quotes
  { key: "quotes.read",                 name: "Teklif Görüntüleme",              category: "quotes" },
  { key: "quotes.create",               name: "Teklif Oluşturma",                category: "quotes" },
  { key: "quotes.update",               name: "Teklif Düzenleme",                category: "quotes" },
  { key: "quotes.delete",               name: "Teklif Silme",                    category: "quotes" },
  { key: "quotes.send",                 name: "Teklif Gönderme",                 category: "quotes" },
  { key: "quoteTemplates.read",         name: "Teklif Şablonu Görüntüleme",      category: "quotes" },
  { key: "quoteTemplates.write",        name: "Teklif Şablonu Yönetimi",         category: "quotes" },

  // Tasks
  { key: "tasks.read",                  name: "Görev Görüntüleme",               category: "tasks" },
  { key: "tasks.create",                name: "Görev Oluşturma",                 category: "tasks" },
  { key: "tasks.update",                name: "Görev Düzenleme",                 category: "tasks" },
  { key: "tasks.delete",                name: "Görev Silme",                     category: "tasks" },
  { key: "tasks.assign",                name: "Görev Atama",                     category: "tasks" },

  // Campaigns
  { key: "campaigns.read",              name: "Kampanya Görüntüleme",            category: "campaigns" },
  { key: "campaigns.create",            name: "Kampanya Oluşturma",              category: "campaigns" },
  { key: "campaigns.update",            name: "Kampanya Düzenleme",              category: "campaigns" },
  { key: "campaigns.delete",            name: "Kampanya Silme",                  category: "campaigns" },
  { key: "campaigns.send",              name: "Kampanya Gönderme",               category: "campaigns" },

  // Search / Activity
  { key: "search.read",                 name: "Arama",                           category: "search" },
  { key: "activity.read",               name: "Aktivite Görüntüleme",            category: "activity" },

  // Inventory
  { key: "inventory.read",              name: "Envanter Görüntüleme",            category: "inventory" },
  { key: "inventory.write",             name: "Envanter Yazma",                  category: "inventory" },
  { key: "inventory.count",             name: "Stok Sayımı",                     category: "inventory" },
  { key: "inventory.sync",              name: "Envanter Senkronizasyonu",        category: "inventory" },

  // XML Sync
  { key: "xml.read",                    name: "XML Görüntüleme",                 category: "xml" },
  { key: "xml.configure",               name: "XML Yapılandırma",                category: "xml" },
  { key: "xml.sync",                    name: "XML Senkronizasyonu",             category: "xml" },

  // Marketplace Listings
  { key: "marketplaceListings.read",    name: "Listeleme Görüntüleme",           category: "marketplace" },
  { key: "marketplaceListings.write",   name: "Listeleme Yazma",                 category: "marketplace" },
  { key: "marketplaceListings.monitor", name: "Listeleme İzleme",               category: "marketplace" },

  // Marketplace Read Intelligence
  { key: "marketplaceAnalytics.read",   name: "Pazar Yeri Analitik",            category: "marketplace" },
  { key: "marketplaceOrders.read",      name: "Sipariş Görüntüleme",             category: "marketplace" },
  { key: "marketplaceReturns.read",     name: "İade Görüntüleme",               category: "marketplace" },

  // Marketplace Operations (Phase 16)
  { key: "marketplaceQuestions.read",   name: "Müşteri Soruları Görüntüleme",    category: "marketplace" },
  { key: "marketplaceQuestions.answer", name: "Müşteri Soruları Yanıtlama",      category: "marketplace" },
  { key: "marketplaceReturns.action",   name: "İade İşlem Yetkisi",              category: "marketplace" },
  { key: "marketplaceMappings.read",    name: "Ürün Eşleştirme Görüntüleme",    category: "marketplace" },
  { key: "marketplaceMappings.write",   name: "Ürün Eşleştirme Yazma",          category: "marketplace" },
  { key: "exchangeRates.manage",        name: "Döviz Kuru Yönetimi",            category: "finance" },

  // Profitability
  { key: "profitability.read",          name: "Karlılık Görüntüleme",            category: "profitability" },
  { key: "profitability.configure",     name: "Karlılık Yapılandırma",           category: "profitability" },

  // Procurement
  { key: "procurement.read",            name: "Tedarik Görüntüleme",             category: "procurement" },
  { key: "procurement.recommend",       name: "Tedarik Önerisi",                 category: "procurement" },
  { key: "procurement.approve",         name: "Tedarik Onayı",                   category: "procurement" },

  // Suppliers
  { key: "suppliers.read",              name: "Tedarikçi Görüntüleme",           category: "suppliers" },
  { key: "suppliers.write",             name: "Tedarikçi Yazma",                 category: "suppliers" },

  // Executive
  { key: "executive.read",              name: "Yönetici Paneli",                 category: "executive" },

  // Dangerous — registered in Permission table but NEVER in RolePermission.
  // Only accessible via explicit UserPermission grant.
  { key: "migrations.approve",          name: "Migrasyon Onayı ⚠️",              category: "dangerous" },
  { key: "destructiveActions.approve",  name: "Yıkıcı İşlem Onayı ⚠️",          category: "dangerous" },
] as const;

// ── Role default permission assignments ─────────────────────────────────────
// Key: UserRole enum value. Value: array of permission keys to assign by default.
// ADMIN: no entries needed — short-circuited in permission engine.
// CUSTOM: no entries — all access via UserPermission overrides only.
// Dangerous permissions are intentionally excluded from all roles.

const ROLE_DEFAULT_PERMISSIONS: Record<string, string[]> = {
  SALES: [
    "customers.read",
    "customers.create",
    "customers.update",
    "quotes.read",
    "quotes.create",
    "quotes.update",
    "quotes.send",
    "quoteTemplates.read",
    "quoteTemplates.write",
    "tasks.read",
    "tasks.create",
    "tasks.update",
    "products.read",
    "categories.read",
    "attributes.read",
    "search.read",
    "activity.read",
  ],
  OPERATIONS: [
    "products.read",
    "products.update",
    "inventory.read",
    "inventory.write",
    "inventory.count",
    "tasks.read",
    "tasks.create",
    "tasks.update",
    "marketplaceListings.read",
    "categories.read",
    "attributes.read",
    "search.read",
  ],
  WAREHOUSE: [
    // Warehouse staff can view and count stock — no financial data
    "products.read",
    "inventory.read",
    "inventory.write",
    "inventory.count",
    "categories.read",
    "attributes.read",
    "tasks.read",
    "tasks.update",
    "search.read",
  ],
  MARKETPLACE_OPERATOR: [
    "marketplaceListings.read",
    "marketplaceListings.write",
    "marketplaceListings.monitor",
    "marketplaceAnalytics.read",
    "marketplaceOrders.read",
    "marketplaceReturns.read",
    // Phase 16 additions
    "marketplaceQuestions.read",
    "marketplaceQuestions.answer",
    "marketplaceReturns.action",
    "marketplaceMappings.read",
    "products.read",
    "tasks.read",
    "tasks.create",
    "tasks.update",
    "search.read",
  ],
};

// ── Seed main ────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 IOTOMASYON Phase 5 RBAC Seed başlıyor...\n");

  // 1. Upsert system roles
  console.log("📋 Sistem rolleri oluşturuluyor...");
  for (const role of SYSTEM_ROLES) {
    await prisma.role.upsert({
      where: { key: role.key },
      update: { name: role.name, isSystem: role.isSystem },
      create: { key: role.key, name: role.name, isSystem: role.isSystem },
    });
    console.log(`   ✓ ${role.key} — ${role.name}`);
  }

  // 2. Upsert all permission keys
  console.log("\n🔑 İzin anahtarları oluşturuluyor...");
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: { name: perm.name, category: perm.category },
      create: { key: perm.key, name: perm.name, category: perm.category },
    });
  }
  console.log(`   ✓ ${PERMISSIONS.length} izin kaydedildi`);

  // 3. Assign default permissions to roles
  console.log("\n🔗 Rol varsayılan izinleri atanıyor...");

  for (const [roleKey, permKeys] of Object.entries(ROLE_DEFAULT_PERMISSIONS)) {
    const role = await prisma.role.findUnique({ where: { key: roleKey } });
    if (!role) {
      console.warn(`   ⚠️  Rol bulunamadı: ${roleKey} — atlandı`);
      continue;
    }

    let assigned = 0;
    for (const permKey of permKeys) {
      // Safety: never assign dangerous permissions to any role
      if (permKey === "migrations.approve" || permKey === "destructiveActions.approve") {
        console.warn(`   ⚠️  Tehlikeli izin rol varsayılanına eklenemez: ${permKey}`);
        continue;
      }

      const permission = await prisma.permission.findUnique({ where: { key: permKey } });
      if (!permission) {
        console.warn(`   ⚠️  İzin bulunamadı: ${permKey} — atlandı`);
        continue;
      }

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id,
        },
      });
      assigned++;
    }

    console.log(`   ✓ ${roleKey}: ${assigned} izin atandı`);
  }

  // 4. Verify no dangerous permissions leaked into RolePermission
  const dangerousInRoles = await prisma.rolePermission.count({
    where: {
      permission: {
        category: "dangerous",
      },
    },
  });

  if (dangerousInRoles > 0) {
    throw new Error(
      `Seed güvenlik ihlali: ${dangerousInRoles} tehlikeli izin RolePermission tablosunda bulundu. Seed durduruldu.`,
    );
  }

  // 5. Summary
  const roleCount = await prisma.role.count();
  const permCount = await prisma.permission.count();
  const rolePermCount = await prisma.rolePermission.count();

  console.log("\n✅ Seed tamamlandı:");
  console.log(`   Roller:             ${roleCount}`);
  console.log(`   İzinler:            ${permCount}`);
  console.log(`   Rol→İzin atamaları: ${rolePermCount}`);
  console.log(`   Tehlikeli izin kontrol: temiz`);
  console.log("\n⚡ Not: Admin için RolePermission satırı gerekmez (kod seviyesinde bypass).");
  console.log("⚡ Not: CUSTOM rolü için varsayılan izin yoktur (UserPermission ile manuel atama).");
}

main()
  .catch((error) => {
    console.error("❌ Seed hatası:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
