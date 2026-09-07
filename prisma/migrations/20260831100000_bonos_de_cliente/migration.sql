-- CreateTable
CREATE TABLE "VoucherTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VoucherTemplate_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoucherTemplateService" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "totalSessions" INTEGER NOT NULL,
    "basePriceCents" INTEGER NOT NULL,
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "VoucherTemplateService_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "VoucherTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VoucherTemplateService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomerVoucher" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clinicId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "pricePaidCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "saleLineId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomerVoucher_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CustomerVoucher_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CustomerVoucher_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "VoucherTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CustomerVoucher_saleLineId_fkey" FOREIGN KEY ("saleLineId") REFERENCES "SaleLine" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomerVoucherService" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "voucherId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "totalSessions" INTEGER NOT NULL,
    "basePriceCents" INTEGER NOT NULL,
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CustomerVoucherService_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "CustomerVoucher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerVoucherService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoucherSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "voucherId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "saleLineId" TEXT,
    "usedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoucherSession_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "CustomerVoucher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VoucherSession_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VoucherSession_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VoucherSession_saleLineId_fkey" FOREIGN KEY ("saleLineId") REFERENCES "SaleLine" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "VoucherTemplate_clinicId_idx" ON "VoucherTemplate"("clinicId");

-- CreateIndex
CREATE INDEX "VoucherTemplateService_serviceId_idx" ON "VoucherTemplateService"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherTemplateService_templateId_serviceId_key" ON "VoucherTemplateService"("templateId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerVoucher_saleLineId_key" ON "CustomerVoucher"("saleLineId");

-- CreateIndex
CREATE INDEX "CustomerVoucher_clinicId_customerId_idx" ON "CustomerVoucher"("clinicId", "customerId");

-- CreateIndex
CREATE INDEX "CustomerVoucher_customerId_status_idx" ON "CustomerVoucher"("customerId", "status");

-- CreateIndex
CREATE INDEX "CustomerVoucherService_serviceId_idx" ON "CustomerVoucherService"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerVoucherService_voucherId_serviceId_key" ON "CustomerVoucherService"("voucherId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherSession_saleLineId_key" ON "VoucherSession"("saleLineId");

-- CreateIndex
CREATE INDEX "VoucherSession_voucherId_idx" ON "VoucherSession"("voucherId");

-- CreateIndex
CREATE INDEX "VoucherSession_voucherId_serviceId_idx" ON "VoucherSession"("voucherId", "serviceId");

