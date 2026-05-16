# Database Schema State

## Purpose

This document describes the actual current Prisma schema state.

It is the schema companion to:
- `docs/PROGRESS.md`
- `docs/current-state.md`
- `prisma/schema.prisma`

It must stay factual.

Roadmap intent must not be documented here as if it already exists in schema.

---

## Current Core Models

### Role

Purpose:
- RBAC role metadata
- default permission grouping

Key relationships:
- `Role` -> `RolePermission`

Important fields:
- `id`
- `key`
- `name`
- `isSystem`
- `createdAt`
- `updatedAt`

### Permission

Purpose:
- canonical permission registry

Key relationships:
- `Permission` -> `RolePermission`
- `Permission` -> `UserPermission`

Important fields:
- `id`
- `key`
- `name`
- `category`
- `createdAt`
- `updatedAt`

### RolePermission

Purpose:
- default permission mapping for a role

Key relationships:
- `roleId` -> `Role`
- `permissionId` -> `Permission`

Important fields:
- `roleId`
- `permissionId`

### UserPermission

Purpose:
- per-user permission override
- explicit grant or explicit deny

Key relationships:
- `userId` -> `User`
- `permissionId` -> `Permission`

Important fields:
- `userId`
- `permissionId`
- `granted`
- `createdAt`

### User

Purpose:
- internal application user identity
- owner/creator/assignee relationships
- RBAC override anchor

Key relationships:
- `User` -> `UserPermission`
- `User` -> `Product`
- `User` -> `Customer`
- `User` -> `ProductInterest`
- `User` -> `FollowUpTask`
- `User` -> `Quote`
- `User` -> `CategoryInterest`
- `User` -> `OutreachCampaign`

Important fields:
- `id`
- `email`
- `passwordHash`
- `name`
- `role`
- `isActive`
- `createdAt`
- `updatedAt`

### ProductCategory

Purpose:
- product category tree
- category-level relationship context

Key relationships:
- self-referencing parent/child tree
- `ProductCategory` -> `Product`
- `ProductCategory` -> `CategoryInterest`
- `ProductCategory` -> `OutreachCampaign`

Important fields:
- `id`
- `name`
- `slug`
- `description`
- `parentId`
- `createdAt`
- `updatedAt`

### Product

Purpose:
- core product record
- product-side anchor for CRM relationships, quotes, campaigns, and inventory intelligence

Key relationships:
- optional `categoryId` -> `ProductCategory`
- optional `createdById` -> `User`
- optional `lastStockCountById` -> `User`
- `Product` -> `ProductInterest`
- `Product` -> `Note`
- `Product` -> `FollowUpTask`
- `Product` -> `QuoteItem`
- `Product` -> `OutreachCampaign`
- `Product` -> `ProductAttributeAssignment`

Important fields:
- `id`
- `sku`
- `barcode` (unique — Phase 7)
- `name`
- `imageUrl` (Phase 7)
- `category`
- `categoryId`
- `brand`
- `model`
- `supplier` (Phase 7)
- `stockQuantity`
- `minimumStock`
- `reorderLeadTime` (days — Phase 7)
- `stockSource` (`StockSource` enum — Phase 7)
- `stockConfidence` (`StockConfidence` enum — Phase 7)
- `lastStockSyncAt` (Phase 7)
- `lastStockCountById` (Phase 7)
- `location`
- `description`
- `isActive`
- `shippingCost` (Phase 7)
- `shippingCostOverride` (Phase 7)
- `marketplaceCommission` (Phase 7)
- `marketplaceCommissionOverride` (Phase 7)
- `unitCostTry` (`DECIMAL` — Phase 8)
- `sellingPriceTry` (`DECIMAL` — Phase 8, VAT-inclusive retail price)
- `wholesalePriceTry` (`DECIMAL` — Phase 8, VAT-inclusive)
- `marketplacePriceTry` (`DECIMAL` — Phase 8, VAT-inclusive)
- `packagingCost` (`DECIMAL` — Phase 8)
- `vatRate` (`DECIMAL` — Phase 8, percentage, e.g. 20)
- `paymentFeeRate` (`DECIMAL` — Phase 8, e.g. 2.5)
- `returnReserveRate` (`DECIMAL` — Phase 8, e.g. 3)
- `onlineSalesPotential` (`INT` — Phase 9, monthly unit estimate)
- `wholesaleSalesPotential` (`INT` — Phase 9)
- `installerSalesPotential` (`INT` — Phase 9)
- `xmlLocked` (`BOOLEAN DEFAULT false` — Phase 11, manual override protection)
- `importDate`
- `importQuantity`
- `importUnitCostUsd`
- `inventoryCountDate`
- `inventoryCountStock`
- `createdById`
- `createdAt`
- `updatedAt`

### ProductAttribute

Purpose:
- reusable product/customer attribute vocabulary

Key relationships:
- `ProductAttribute` -> `ProductAttributeAssignment`
- `ProductAttribute` -> `CustomerAttributeInterest`

Important fields:
- `id`
- `name`
- `createdAt`

### ProductAttributeAssignment

Purpose:
- product-to-attribute junction

Key relationships:
- `productId` -> `Product`
- `attributeId` -> `ProductAttribute`

Important fields:
- `productId`
- `attributeId`
- `createdAt`

### Customer

Purpose:
- CRM customer record
- anchor for notes, tasks, quotes, outreach, and relationship tracking

Key relationships:
- optional `ownedById` -> `User`
- `Customer` -> `ProductInterest`
- `Customer` -> `CategoryInterest`
- `Customer` -> `Note`
- `Customer` -> `FollowUpTask`
- `Customer` -> `Quote`
- `Customer` -> `OutreachRecipient`
- `Customer` -> `CustomerAttributeInterest`

Important fields:
- `id`
- `name`
- `phone`
- `whatsapp`
- `email`
- `company`
- `status` (`CustomerStatus` enum)
- `country`
- `customerNotes`
- `customerType` (`CustomerType` enum — Phase 6: TOPTAN, PERAKENDE, SITE_YONETICISI, GUVENLIK_SIRKETI, MAGAZA, ONLINE_SATICI, CUSTOM)
- `monthlySalesPotential` (`DECIMAL(15,2)` — Phase 6)
- `platformNotes` (`TEXT` — Phase 6)
- `city`
- `district`
- `address`
- `taxOffice`
- `taxNumber`
- `source`
- `ownedById`
- `isActive`
- `lastContactedAt`
- `createdAt`
- `updatedAt`

### CustomerAttributeInterest

Purpose:
- customer-to-attribute junction

Key relationships:
- `customerId` -> `Customer`
- `attributeId` -> `ProductAttribute`

Important fields:
- `customerId`
- `attributeId`
- `createdAt`

### CategoryInterest

Purpose:
- category-level customer relationship tracking

Key relationships:
- `customerId` -> `Customer`
- `categoryId` -> `ProductCategory`
- optional `createdById` -> `User`

Important fields:
- `id`
- `customerId`
- `categoryId`
- `stage`
- `notes`
- `createdAt`
- `updatedAt`
- `createdById`

### ProductInterest

Purpose:
- product-level customer interest and sales follow-up tracking

Key relationships:
- `customerId` -> `Customer`
- `productId` -> `Product`
- optional `createdById` -> `User`
- optional `assignedToId` -> `User`
- `ProductInterest` -> `Note`

Important fields:
- `id`
- `customerId`
- `productId`
- `quantity`
- `quotedPrice`
- `currency`
- `stage`
- `interestNotes`
- `targetPrice`
- `priority`
- `status`
- `followUpAt`
- `lastContactedAt`
- `closedAt`
- `source`
- `createdById`
- `assignedToId`
- `createdAt`
- `updatedAt`

### Note

Purpose:
- timeline/note record across customer, product, or interest context

Key relationships:
- optional `customerId` -> `Customer`
- optional `productId` -> `Product`
- optional `interestId` -> `ProductInterest`
- optional `createdById` -> `User`

Important fields:
- `id`
- `content`
- `type`
- `customerId`
- `productId`
- `interestId`
- `createdById`
- `createdAt`

### FollowUpTask

Purpose:
- follow-up task tracking

Key relationships:
- optional `customerId` -> `Customer`
- optional `productId` -> `Product`
- optional `assignedToId` -> `User`
- optional `createdById` -> `User`

Important fields:
- `id`
- `title`
- `description`
- `dueDate`
- `status`
- `priority`
- `completedAt`
- `customerId`
- `productId`
- `assignedToId`
- `createdById`
- `createdAt`
- `updatedAt`

### Quote

Purpose:
- quote workflow v1 record

Key relationships:
- `customerId` -> `Customer`
- optional `createdById` -> `User`
- `Quote` -> `QuoteItem`
- `Quote` -> `OutreachRecipient`

Important fields:
- `id`
- `customerId`
- `quoteNumber`
- `status`
- `notes`
- `paymentTerms`
- `deliveryTerms`
- `warrantyTerms`
- `validityDate`
- `sentAt`
- `currencyMode`
- `exchangeRate`
- `subtotal`
- `discountTotal`
- `taxTotal`
- `total`
- `createdById`
- `createdAt`
- `updatedAt`

### QuoteItem

Purpose:
- line item inside a quote

Key relationships:
- `quoteId` -> `Quote`
- optional `productId` -> `Product`

Important fields:
- `id`
- `quoteId`
- `productId`
- `description`
- `quantity`
- `unitPrice`
- `currency`
- `discount`
- `tax`
- `total`
- `createdAt`

### OutreachCampaign

Purpose:
- outbound campaign container

Key relationships:
- optional `productId` -> `Product`
- optional `categoryId` -> `ProductCategory`
- optional `createdById` -> `User`
- `OutreachCampaign` -> `OutreachRecipient`

Important fields:
- `id`
- `productId`
- `categoryId`
- `message`
- `offerText`
- `price`
- `currency`
- `status`
- `createdById`
- `createdAt`
- `updatedAt`

### OutreachRecipient

Purpose:
- recipient-level campaign tracking

Key relationships:
- `campaignId` -> `OutreachCampaign`
- `customerId` -> `Customer`
- optional `quoteId` -> `Quote`

Important fields:
- `id`
- `campaignId`
- `customerId`
- `phone`
- `status`
- `sentAt`
- `repliedAt`
- `quoteId`
- `wonAmount`
- `createdAt`

### CapitalConfig

Purpose:
- admin-level capital allocation configuration (singleton per user)
- stores total capital, reserve percentage, desired turnover months

Key relationships:
- `userId` -> `User`

Important fields:
- `id`
- `userId`
- `totalCapitalTry` (`DECIMAL`)
- `reservePct` (default 20)
- `desiredTurnoverMonths` (default 3)
- `createdAt`
- `updatedAt`

Phase: 10

### XmlSyncSource

Purpose:
- external XML inventory feed source configuration

Key relationships:
- `XmlSyncSource` -> `XmlSyncLog`

Important fields:
- `id`
- `name`
- `url`
- `isEnabled` (`BOOLEAN`)
- `authHeader` (nullable — optional Basic/Bearer auth)
- `lastSyncAt`
- `lastStatus` (`XmlSyncStatus` enum, nullable)
- `createdAt`
- `updatedAt`

Phase: 11

### XmlSyncLog

Purpose:
- per-sync execution record for audit and monitoring

Key relationships:
- `sourceId` -> `XmlSyncSource` (CASCADE delete)

Important fields:
- `id`
- `sourceId`
- `startedAt`
- `completedAt`
- `status` (`XmlSyncStatus` enum)
- `recordsFound`
- `recordsUpdated`
- `recordsSkipped`
- `errorMessage`

Phase: 11

### MarketplaceListing

Purpose:
- registry of product listings across marketplace platforms

Key relationships:
- `productId` -> `Product` (CASCADE delete)
- optional `responsibleId` -> `User` (SET NULL on delete)

Important fields:
- `id`
- `productId`
- `platform` (`MarketplacePlatform` enum)
- `platformListingId` (nullable — external ID)
- `listingUrl` (nullable)
- `listingBarcode` (nullable)
- `listingSku` (nullable)
- `listingTitle` (nullable)
- `status` (`ListingStatus` enum, default UNKNOWN)
- `notes` (nullable)
- `responsibleId` (nullable)
- `lastCheckedAt` (nullable)
- `createdAt`
- `updatedAt`

Phase: 12

### TrendyolConfig

Purpose:
- singleton Trendyol API credentials and configuration
- one record per installation (id always 1)

Key relationships:
- none (no FK)

Important fields:
- `id` (singleton — always 1)
- `supplierId`
- `apiKey`
- `apiSecret`
- `isEnabled` (`BOOLEAN`)
- `lastSyncAt` (nullable)
- `updatedAt`

Phase: 14

---

## Current Enums

- `UserRole` (ADMIN, SALES, OPERATIONS, MARKETPLACE_OPERATOR, CUSTOM — Phase 5 expanded)
- `CustomerType` (TOPTAN, PERAKENDE, SITE_YONETICISI, GUVENLIK_SIRKETI, MAGAZA, ONLINE_SATICI, CUSTOM — Phase 6)
- `StockSource` (MANUAL, XML, API, IMPORT — Phase 7)
- `StockConfidence` (HIGH, MEDIUM, LOW — Phase 7)
- `XmlSyncStatus` (RUNNING, SUCCESS, PARTIAL, ERROR — Phase 11)
- `MarketplacePlatform` (TRENDYOL, HEPSIBURADA, N11, PTTAVM, KOCTAS, TEKNOSA, TEMU, CUSTOM — Phase 12)
- `ListingStatus` (ACTIVE, INACTIVE, SUSPENDED, UNKNOWN — Phase 12)
- `CustomerStatus`
- `InterestStatus`
- `InterestPriority`
- `InterestStage`
- `TaskStatus`
- `TaskPriority`
- `NoteType`
- `QuoteStatus`
- `QuoteCurrencyMode`
- `OutreachStatus`
- `RecipientStatus`

---

## Current Active Relationships

- `Role` <-> `Permission` through `RolePermission`
- `User` <-> `Permission` through `UserPermission`
- `User` -> `Product`
- `User` -> `Customer`
- `User` -> `ProductInterest`
- `User` -> `FollowUpTask`
- `User` -> `Quote`
- `User` -> `CategoryInterest`
- `User` -> `OutreachCampaign`
- `ProductCategory` -> `Product`
- `ProductCategory` -> `CategoryInterest`
- `ProductCategory` -> `OutreachCampaign`
- `Product` <-> `ProductAttribute` through `ProductAttributeAssignment`
- `Customer` <-> `ProductAttribute` through `CustomerAttributeInterest`
- `Customer` <-> `Product` through `ProductInterest`
- `Customer` <-> `ProductCategory` through `CategoryInterest`
- `Customer` -> `Note`
- `Customer` -> `FollowUpTask`
- `Customer` -> `Quote`
- `Customer` -> `OutreachRecipient`
- `Quote` -> `QuoteItem`
- `Quote` -> `OutreachRecipient`
- `OutreachCampaign` -> `OutreachRecipient`
- `User` -> `CapitalConfig` (Phase 10)
- `XmlSyncSource` -> `XmlSyncLog` (Phase 11)
- `Product` -> `MarketplaceListing` (Phase 12)
- `User` -> `MarketplaceListing` as responsible (Phase 12)

---

## Technical Constraints

- Phase 5 RBAC schema is production-active: Role, Permission, RolePermission, UserPermission tables exist and are seeded.
- `User.role` participates in both the internal auth model and the RBAC engine (ADMIN bypass, role-default lookup).
- RBAC is roadmap-complete for Phase 5 scope. Future phases may add more permission categories.
- Phase 6 Customer Intelligence fields are production-active: CustomerType enum, monthlySalesPotential, platformNotes.
- Phase 7 Inventory Intelligence fields added: barcode, imageUrl, supplier, stockSource, stockConfidence, lastStockSyncAt, lastStockCountById, reorderLeadTime, shippingCost, shippingCostOverride, marketplaceCommission, marketplaceCommissionOverride.
- Phase 8 Profitability Engine fields added to Product: unitCostTry, sellingPriceTry, wholesalePriceTry, marketplacePriceTry, packagingCost, vatRate, paymentFeeRate, returnReserveRate. `lib/profitability.ts` computes per-channel (perakende/toptan/pazar yeri) net profit, margin %, ROI %.
- Phase 9 Sales Potential fields added to Product: onlineSalesPotential, wholesaleSalesPotential, installerSalesPotential. `lib/sales-potential.ts` computes investment score 0–100 and BUY/WAIT/DO_NOT_BUY signal.
- Phase 10 CapitalConfig table added: admin-only, per-user, stores totalCapitalTry, reservePct, desiredTurnoverMonths. `lib/capital-allocation.ts` computes deployable capital and ranked purchase suggestions.
- Phase 11 XmlSyncSource and XmlSyncLog tables added. Product.xmlLocked field added. `lib/xml-sync.ts` parser and Vercel daily cron endpoint active.
- Phase 12 MarketplaceListing table added. 8 platforms (MarketplacePlatform enum), 4 statuses (ListingStatus enum). Product and User models have `marketplaceListings[]` relation.
- Phase 13 adds no new schema — monitoring alerts computed from MarketplaceListing data server-side.
- Phase 14 TrendyolConfig singleton table added. `lib/trendyol-api.ts` provides Basic-auth fetch for orders and returns (read-only).
- Phase 15 adds no new schema — marketplace profit dashboard computed from existing Product pricing fields via `calculateProfitability()`.
- Quote schema supports quote workflow v1, not quote professionalization v2.
- Current activity-related models are operational timeline models, not audit-grade event history.
- Current schema is relationship-aware for CRM, quoting, inventory, profitability, sales potential, capital allocation, XML sync, marketplace listings, and Trendyol API.

---

## Known Schema Gaps

- no structured supplier model (supplier exists as plain text field on Product; Phase 20 defines a proper Supplier table)
- no executive KPI schema (Phase 22)
- no procurement decision schema (Phases 19–21)
- no import cost calculator schema (Phase 21)
- no audit-grade event history schema
- no image pipeline / media storage schema

---

## Migration State

- Prisma migration folder exists under `prisma/migrations`
- The project is operating on committed migration history, not ad hoc schema-only assumptions
- Production architecture assumes Supabase PostgreSQL
- Current schema now includes RBAC-related models and therefore requires migration discipline for auth/permission changes
- Future schema-heavy phases increase migration risk significantly

Schema safety notes:
- destructive migrations should never be assumed safe
- schema-heavy roadmap phases require explicit migration discipline
- backup, rollback, and production write governance are not optional for future phases
