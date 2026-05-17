-- Phase 75: Add secondaryUrl to XmlSyncSource
-- Allows a single sync source to pull from two XML feeds (same supplier, different subsets)
-- and merge them intelligently by SKU before processing.
-- Additive only — no data loss.

ALTER TABLE "XmlSyncSource" ADD COLUMN "secondaryUrl" TEXT;
