/*
  Warnings:

  - You are about to drop the `TestItem` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('user', 'admin', 'moderator', 'tester');

-- CreateEnum
CREATE TYPE "public"."CEFRLevel" AS ENUM ('A1', 'A1Plus', 'A2', 'A2Plus', 'B1', 'B1Plus', 'B2', 'B2Plus', 'C1', 'C2');

-- DropTable
DROP TABLE "public"."TestItem";

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "username" TEXT,
    "role" "public"."Role" NOT NULL DEFAULT 'user',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLogin" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_settings" (
    "userId" TEXT NOT NULL,
    "nativeLanguageCode" TEXT NOT NULL,
    "interfaceLanguageCode" TEXT NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "public"."user_languages" (
    "userId" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "initialLevel" "public"."CEFRLevel" NOT NULL,

    CONSTRAINT "user_languages_pkey" PRIMARY KEY ("userId","languageCode")
);

-- CreateTable
CREATE TABLE "public"."auth_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ia_credits" (
    "userId" TEXT NOT NULL,
    "creditsAvailable" INTEGER NOT NULL DEFAULT 0,
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "lastReset" TIMESTAMP(3),
    "limitStrategy" TEXT NOT NULL DEFAULT 'manual',
    "pendingRecharge" BOOLEAN NOT NULL DEFAULT false,
    "lastUsageAt" TIMESTAMP(3),

    CONSTRAINT "ia_credits_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "public"."ia_usage_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tokenCost" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "inputLength" INTEGER,
    "outputLength" INTEGER,

    CONSTRAINT "ia_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "public"."users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_refreshToken_key" ON "public"."auth_tokens"("refreshToken");

-- AddForeignKey
ALTER TABLE "public"."user_settings" ADD CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_languages" ADD CONSTRAINT "user_languages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."auth_tokens" ADD CONSTRAINT "auth_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ia_credits" ADD CONSTRAINT "ia_credits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ia_usage_logs" ADD CONSTRAINT "ia_usage_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
