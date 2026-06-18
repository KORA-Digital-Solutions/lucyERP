import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { StockClient, type ProductRow, type SupplierRow } from "@/components/stock-client"

export const dynamic = "force-dynamic"

export default async function StockPage() {
  const clinic = await getActiveClinic()

  const [products, suppliers] = await Promise.all([
    prisma.product.findMany({
      where: { clinicId: clinic.id },
      include: { supplier: true },
      orderBy: { name: "asc" },
    }),
    prisma.supplier.findMany({
      where: { clinicId: clinic.id, active: true },
      orderBy: { name: "asc" },
    }),
  ])

  const productRows: ProductRow[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    supplierName: p.supplier?.name ?? null,
    supplierId: p.supplierId,
    priceCents: p.priceCents,
    costCents: p.costCents,
    stock: p.stock,
    stockMin: p.stockMin,
    active: p.active,
  }))

  const supplierRows: SupplierRow[] = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    phone: s.phone,
    email: s.email,
    notes: s.notes,
    active: s.active,
  }))

  return <StockClient products={productRows} suppliers={supplierRows} />
}
