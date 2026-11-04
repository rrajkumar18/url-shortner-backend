-- AlterTable
ALTER TABLE "Url" ADD COLUMN     "userId" INTEGER;

-- CreateIndex
CREATE INDEX "Url_userId_idx" ON "Url"("userId");

-- AddForeignKey
ALTER TABLE "Url" ADD CONSTRAINT "Url_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
