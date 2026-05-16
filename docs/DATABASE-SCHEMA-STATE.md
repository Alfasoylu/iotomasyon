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
- product-side anchor for CRM relationships, quotes, campaigns, and future inventory intelligence

Key relationships:
- optional `categoryId` -> `ProductCategory`
- optional `createdById` -> `User`
- `Product` -> `ProductInterest`
- `Product` -> `Note`
- `Product` -> `FollowUpTask`
- `Product` -> `QuoteItem`
- `Product` -> `OutreachCampaign`
- `Product` -> `ProductAttributeAssignment`

Important fields:
- `id`
- `sku`
- `name`
- `category`
- `categoryId`
- `brand`
- `model`
- `stockQuantity`
- `minimumStock`
- `location`
- `description`
- `isActive`
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
- `customerType` (`CustomerType` enum — Phase 6: RETAILER, WHOLESALER, DISTRIBUTOR, CONTRACTOR, END_USER, OTHER)
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

---

## Current Enums

- `UserRole` (ADMIN, SALES, OPERATIONS, MARKETPLACE_OPERATOR, CUSTOM — Phase 5 expanded)
- `CustomerType` (RETAILER, WHOLESALER, DISTRIBUTOR, CONTRACTOR, END_USER, OTHER — Phase 6)
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

---

## Technical Constraints

- Phase 5 RBAC schema is production-active: Role, Permission, RolePermission, UserPermission tables exist and are seeded.
- `User.role` participates in both the internal auth model and the RBAC engine (ADMIN bypass, role-default lookup).
- RBAC is roadmap-complete for Phase 5 scope. Future phases may add more permission categories.
- Phase 6 Customer Intelligence fields are production-active: CustomerType enum, monthlySalesPotential, platformNotes.
- Product cost data is partial and is not yet a profitability engine.
- Quote schema supports quote workflow v1, not quote professionalization v2.
- Current activity-related models are operational timeline models, not audit-grade event history.
- Current schema is relationship-aware for CRM and quoting, but not intelligence-complete.

---

## Known Schema Gaps

- no marketplace schema
- no supplier schema
- no profitability schema
- no XML ingestion schema
- no executive KPI schema
- no procurement decision schema
- no import cost calculator schema
- no audit-grade event history schema

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
