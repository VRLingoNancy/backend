/*
  Warnings:

  - You are about to drop the column `inputLength` on the `ia_usage_logs` table. All the data in the column will be lost.
  - You are about to drop the column `outputLength` on the `ia_usage_logs` table. All the data in the column will be lost.
  - Added the required column `completionTokens` to the `ia_usage_logs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `promptTokens` to the `ia_usage_logs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalTokens` to the `ia_usage_logs` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."ia_usage_logs" DROP COLUMN "inputLength",
DROP COLUMN "outputLength",
ADD COLUMN     "completionTokens" INTEGER NOT NULL,
ADD COLUMN     "promptTokens" INTEGER NOT NULL,
ADD COLUMN     "totalTokens" INTEGER NOT NULL;
