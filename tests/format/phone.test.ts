import { describe, expect, it } from "vitest"
import {
  DEFAULT_PHONE_PREFIX, formatFileNumber, formatNationalPhone, formatPhone,
  isValidPhone, isValidPhonePrefix, joinPhone, splitPhone,
} from "@/lib/format"

// Los teléfonos se guardan en formato internacional ("+34600444555") porque es
// lo que exige la API de WhatsApp, pero se leen en voz alta por bloques, así
// que en pantalla van agrupados y con el prefijo aparte.
describe("formatPhone", () => {
  it("agrupa el móvil español en 3-2-2-2 con el prefijo entre paréntesis", () => {
    expect(formatPhone("+34600444555")).toBe("(+34) 600 44 45 55")
  })

  it("añade el prefijo a los números de 9 dígitos guardados sin él", () => {
    expect(formatPhone("600444555")).toBe("(+34) 600 44 45 55")
  })

  it("ignora los espacios y guiones que traiga el número", () => {
    expect(formatPhone("+34 600-44 45 55")).toBe("(+34) 600 44 45 55")
  })

  it("devuelve cadena vacía si no hay teléfono", () => {
    expect(formatPhone(null)).toBe("")
    expect(formatPhone(undefined)).toBe("")
    expect(formatPhone("  ")).toBe("")
  })

  it("respeta el prefijo entero de un número extranjero", () => {
    // Antes se daba por hecho que el prefijo eran 2 dígitos y este portugués
    // salía como "(+35) 191 234 567 8": mal partido y con un país inventado.
    expect(formatPhone("+351912345678")).toBe("(+351) 912 345 678")
    expect(formatPhone("+212612345678")).toBe("(+212) 612 345 678")
  })

  it("deja intacto lo que no reconoce", () => {
    expect(formatPhone("12345")).toBe("12345")
  })
})

// splitPhone y joinPhone son las dos mitades del formulario: uno reparte el
// número guardado entre los campos y el otro los vuelve a juntar. Tienen que
// ser inversas, o al editar una ficha se corrompería el teléfono.
describe("splitPhone / joinPhone", () => {
  it("separa el prefijo español del número", () => {
    expect(splitPhone("+34600444555")).toEqual({ prefix: "+34", national: "600444555" })
  })

  it("no se come un prefijo largo que empiece igual", () => {
    // "+351" empieza por "+3", pero no debe partirse como "+34".
    expect(splitPhone("+351912345678")).toEqual({ prefix: "+351", national: "912345678" })
  })

  it("sin teléfono devuelve el prefijo por defecto y el número vacío", () => {
    expect(splitPhone(null)).toEqual({ prefix: DEFAULT_PHONE_PREFIX, national: "" })
    expect(splitPhone("")).toEqual({ prefix: DEFAULT_PHONE_PREFIX, national: "" })
  })

  it("un prefijo que no conocemos se deja entero en el número", () => {
    // Mejor enseñarlo sin partir que partirlo por donde no es.
    expect(splitPhone("+998901234567")).toEqual({ prefix: "", national: "+998901234567" })
  })

  it("vuelve a montar el mismo número que se guardó", () => {
    for (const guardado of ["+34600444555", "+351912345678", "+998901234567"]) {
      const { prefix, national } = splitPhone(guardado)
      expect(joinPhone(prefix, formatNationalPhone(prefix, national))).toBe(guardado)
    }
  })

  it("sin número no hay teléfono, aunque el prefijo esté puesto", () => {
    expect(joinPhone("+34", "")).toBe("")
    expect(joinPhone("+34", "   ")).toBe("")
  })

  it("acepta el prefijo escrito sin el +", () => {
    expect(joinPhone("34", "600 44 45 55")).toBe("+34600444555")
  })

  it("si el prefijo se deja en blanco, se guarda con el de España", () => {
    // El formulario lo rellena solo al escribir el número, pero esto es la red
    // por si llega un número sin prefijo por otra vía.
    expect(joinPhone("", "600 44 45 55")).toBe("+34600444555")
    expect(joinPhone("", "")).toBe("")
  })
})

describe("isValidPhone", () => {
  it("exige 9 dígitos exactos en un número español", () => {
    expect(isValidPhone("+34600111222")).toBe(true)
    expect(isValidPhone("600111222")).toBe(true)
  })

  it("rechaza el número español incompleto o pasado", () => {
    // Antes solo se miraba el largo del número entero contra un rango de 8 a
    // 15, así que colaban desde 6 dígitos hasta 10.
    for (const corto of ["600111", "6001112", "60011122"]) {
      expect(isValidPhone(joinPhone("+34", corto))).toBe(false)
    }
    expect(isValidPhone(joinPhone("+34", "6001112223"))).toBe(false)
  })

  it("no le impone la longitud española a los demás países", () => {
    expect(isValidPhone("+351912345678")).toBe(true)
    expect(isValidPhone("+12025550143")).toBe(true)
  })
})

// El prefijo no se puede comprobar sobre el teléfono ya montado: en
// "+9999600111222" no hay forma de saber dónde acababa. Por eso tiene su
// propia validación, que se aplica al campo por separado.
describe("isValidPhonePrefix", () => {
  it("acepta los prefijos de 1 a 3 dígitos, con + o sin él", () => {
    for (const p of ["+34", "34", "+1", "+351", "+212"]) {
      expect(isValidPhonePrefix(p)).toBe(true)
    }
  })

  it("acepta el vacío, que significa el de por defecto", () => {
    expect(isValidPhonePrefix("")).toBe(true)
    expect(isValidPhonePrefix("  ")).toBe(true)
  })

  it("rechaza lo que no puede ser un país", () => {
    // Antes el campo era texto libre y estos se guardaban tal cual.
    expect(isValidPhonePrefix("9999")).toBe(false)
    expect(isValidPhonePrefix("+0")).toBe(false)
    expect(isValidPhonePrefix("+012")).toBe(false)
    expect(isValidPhonePrefix("abc")).toBe(false)
  })
})

describe("formatFileNumber", () => {
  it("rellena con ceros hasta cuatro dígitos", () => {
    expect(formatFileNumber(1)).toBe("0001")
    expect(formatFileNumber(42)).toBe("0042")
    expect(formatFileNumber(9999)).toBe("9999")
  })

  it("no trunca cuando se pasa de cuatro dígitos", () => {
    expect(formatFileNumber(10000)).toBe("10000")
  })

  it("muestra un guion si el cliente no tiene expediente", () => {
    expect(formatFileNumber(null)).toBe("—")
  })
})
