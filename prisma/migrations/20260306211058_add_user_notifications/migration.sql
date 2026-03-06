-- CreateTable
CREATE TABLE "UserNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "issueId" TEXT,
    "projectId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserNotification_userId_idx" ON "UserNotification"("userId");

-- CreateIndex
CREATE INDEX "UserNotification_userId_read_idx" ON "UserNotification"("userId", "read");

-- AddForeignKey
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
