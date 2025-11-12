/*
  Warnings:

  - You are about to alter the column `tokenCost` on the `ia_usage_logs` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,8)`.

*/
-- AlterTable
ALTER TABLE "public"."ia_usage_logs" ALTER COLUMN "tokenCost" SET DATA TYPE DECIMAL(10,8);
