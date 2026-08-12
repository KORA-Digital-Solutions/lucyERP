-- CreateTable
CREATE TABLE "ClinicWeeklySlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clinicId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClinicWeeklySlot_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkerWeeklySlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clinicId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkerWeeklySlot_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkerWeeklySlot_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClinicScheduleOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clinicId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClinicScheduleOverride_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClinicScheduleOverrideSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "overrideId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    CONSTRAINT "ClinicScheduleOverrideSlot_overrideId_fkey" FOREIGN KEY ("overrideId") REFERENCES "ClinicScheduleOverride" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkerScheduleOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clinicId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkerScheduleOverride_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkerScheduleOverride_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkerScheduleOverrideSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "overrideId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    CONSTRAINT "WorkerScheduleOverrideSlot_overrideId_fkey" FOREIGN KEY ("overrideId") REFERENCES "WorkerScheduleOverride" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clinicId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'LOCAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Holiday_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkerLeaveBalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clinicId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "vacationDaysTotal" REAL NOT NULL DEFAULT 0,
    "personalDaysTotal" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkerLeaveBalance_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkerLeaveBalance_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkerLeave" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clinicId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkerLeave_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkerLeave_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ClinicWeeklySlot_clinicId_dayOfWeek_idx" ON "ClinicWeeklySlot"("clinicId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "WorkerWeeklySlot_workerId_dayOfWeek_idx" ON "WorkerWeeklySlot"("workerId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicScheduleOverride_clinicId_date_key" ON "ClinicScheduleOverride"("clinicId", "date");

-- CreateIndex
CREATE INDEX "ClinicScheduleOverrideSlot_overrideId_idx" ON "ClinicScheduleOverrideSlot"("overrideId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerScheduleOverride_clinicId_workerId_date_key" ON "WorkerScheduleOverride"("clinicId", "workerId", "date");

-- CreateIndex
CREATE INDEX "WorkerScheduleOverrideSlot_overrideId_idx" ON "WorkerScheduleOverrideSlot"("overrideId");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_clinicId_date_key" ON "Holiday"("clinicId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerLeaveBalance_clinicId_workerId_year_key" ON "WorkerLeaveBalance"("clinicId", "workerId", "year");

-- CreateIndex
CREATE INDEX "WorkerLeave_workerId_date_idx" ON "WorkerLeave"("workerId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerLeave_clinicId_workerId_date_key" ON "WorkerLeave"("clinicId", "workerId", "date");
