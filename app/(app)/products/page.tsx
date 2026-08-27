import { prisma } from "@/lib/db"
import { getActiveClinic } from "@/lib/clinic"
import { ProductsClient, type ProductRow, type SupplierRow } from "@/components/products-client"

export const dynamic = "force-dynamic"

export default async function ProductsPage() {
  const clinic = await getActiveClinic()

  const [products, suppliers] = await Promise.all([
    prisma.product.findMany({
      where: { clinicId: clinic.id },
      include: { supplier: true },
      orderBy: { name: "asc" },
    }),
    // Aquí salen también los proveedores dados de baja: es la pantalla donde se
    // vuelven a activar, y si no se ven no hay forma de recuperarlos.
    prisma.supplier.findMany({
      where: { clinicId: clinic.id },
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

  return <ProductsClient products={productRows} suppliers={supplierRows} />
}
