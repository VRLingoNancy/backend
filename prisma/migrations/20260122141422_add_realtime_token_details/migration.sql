-- AlterTable
ALTER TABLE "public"."ia_usage_logs" ADD COLUMN     "completionAudioTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "completionTextTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "promptAudioTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "promptTextTokens" INTEGER NOT NULL DEFAULT 0;
