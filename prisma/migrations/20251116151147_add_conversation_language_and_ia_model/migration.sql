-- AlterTable
ALTER TABLE "public"."conversations" ADD COLUMN     "languageCode" TEXT;

-- AlterTable
ALTER TABLE "public"."user_settings" ADD COLUMN     "defaultIaModel" TEXT,
ADD COLUMN     "preferredStudyLanguage" TEXT;
