# Database Schema State

## Purpose

This document is the single source of truth for the current Prisma schema reality.

It must describe:
- what actually exists in `prisma/schema.prisma`
- what current relationships are active
- what current schema limits exist

It must not describe roadmap-only concepts as implemented schema.

---

## Current Core Models

### User

Purpose:
- internal application user identity
- creator/owner/assignee relationships

Key relationships:
- creates products
- creates notes
- creates interests
- owns interests
- creates tasks
- owns tasks
- creates quotes
- creates category interests
- creates campaigns
- owns customers

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
- category-level product and customer relationship context

Key relationships:
- parent/child category tree
- linked to products
- linked to category interests
- linked to campaigns

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
- inventory-oriented product base
- quote item and outreach context

Key relationships:
- belongs to optional category
- linked to product interests
- linked to notes
- linked to tasks
- linked to quote items
- linked to campaigns
- linked to attribute assignments

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
- assigned to products
- linked to customer attribute interests

Important fields:
- `id`
- `name`
- `createdAt`

### ProductAttributeAssignment

Purpose:
- junction between products and attributes

Key relationships:
- product ↔ attribute

Important fields:
- `productId`
- `attributeId`
- `createdAt`

### Customer

Purpose:
- CRM customer record
- anchor for notes, tasks, interests, quotes, outreach, and ownership

Key relationships:
- linked to product interests
- linked to category interests
- linked to timeline notes
- linked to follow-up tasks
- linked to quotes
- linked to outreach recipients
- linked to attribute interests
- optional owner user

Important fields:
- `id`
- `name`
- `phone`
- `whatsapp`
- `email`
- `company`
- `status`
- `country`
- `customerNotes`
- `customerType`
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
- junction between customers and attributes

Key relationships:
- customer ↔ attribute

Important fields:
- `customerId`
- `attributeId`
- `createdAt`

### CategoryInterest

Purpose:
- category-level customer relationship tracking

Key relationships:
- customer ↔ category
- created by optional user

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
- product-level customer interest and follow-up tracking

Key relationships:
- belongs to customer
- belongs to product
- optional creator user
- optional assignee user
- linked to notes

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
- optional customer
- optional product
- optional interest
- optional creator user

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
- optional customer
- optional product
- optional assigned user
- optional creator user

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
- belongs to customer
- optional creator user
- has quote items
- linked to outreach recipients

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
- belongs to quote
- optional product link

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
- optional product
- optional category
- optional creator user
- has outreach recipients

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
- belongs to campaign
- belongs to customer
- optional linked quote

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

- `UserRole`
- `InterestStatus`
- `InterestPriority`
- `TaskStatus`
- `CustomerStatus`
- `InterestStage`
- `NoteType`
- `TaskPriority`
- `QuoteStatus`
- `QuoteCurrencyMode`
- `OutreachStatus`
- `RecipientStatus`

---

## Current Active Relationships

- `User` → `Product`
- `User` → `Customer`
- `User` → `ProductInterest`
- `User` → `FollowUpTask`
- `User` → `Quote`
- `User` → `CategoryInterest`
- `User` → `OutreachCampaign`
- `ProductCategory` → `Product`
- `ProductCategory` → `CategoryInterest`
- `ProductCategory` → `OutreachCampaign`
- `Product` ↔ `ProductAttribute` through `ProductAttributeAssignment`
- `Customer` ↔ `ProductAttribute` through `CustomerAttributeInterest`
- `Customer` ↔ `Product` through `ProductInterest`
- `Customer` ↔ `ProductCategory` through `CategoryInterest`
- `Customer` → `Note`
- `Customer` → `FollowUpTask`
- `Customer` → `Quote`
- `Customer` → `OutreachRecipient`
- `Quote` → `QuoteItem`
- `Quote` ↔ `OutreachRecipient`
- `OutreachCampaign` → `OutreachRecipient`

---

## Technical Constraints

- Current auth schema supports single internal auth, not RBAC.
- Current `User.role` field exists for legacy/simple internal auth only.
- It does NOT represent a complete RBAC permission governance system.
- Role presence must not be interpreted as implemented authorization architecture.
- There is no permission matrix model in Prisma.
- Product cost data is partial and not a profitability engine.
- Quote schema supports quote workflow v1, not quote professionalization v2.
- Current activity-related models are not audit-grade event history.
- Current schema is relationship-aware for CRM, but not intelligence-complete.

---

## Known Schema Gaps

- no marketplace schema
- no supplier schema
- no profitability schema
- no XML ingestion schema
- no RBAC permission schema
- no executive KPI schema
- no procurement decision schema
- no import cost calculator schema
- no audit-grade event history schema

---

## Migration State

- Prisma migration folder exists under `prisma/migrations`
- The project is operating on committed migration history, not ad hoc schema-only assumptions
- Production architecture assumes Supabase PostgreSQL
- Future schema-heavy phases increase migration risk significantly

Schema safety notes:
- destructive migrations should never be assumed safe
- schema-heavy roadmap phases require explicit migration discipline
- backup, rollback, and production write governance are not optional for future phases
