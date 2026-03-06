-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "fraudFlag" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fraudReason" TEXT,
ADD COLUMN     "pHash" TEXT;

-- CreateIndex
CREATE INDEX "Evidence_pHash_idx" ON "Evidence"("pHash");
