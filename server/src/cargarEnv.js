import fs from 'node:fs'
import { parseEnv } from 'node:util'
import { fileURLToPath } from 'node:url'

const ruta = fileURLToPath(new URL('../../.env', import.meta.url))

if (!fs.existsSync(ruta)) {
    console.log(`[.env] No se encontró el archivo: ${ruta}`)
    for (const nombre of ['.env.txt', '.env.example']) {
        if (fs.existsSync(ruta + nombre.slice(4))) {
            console.log(`[.env] Existe "${nombre}": cópialo o renómbralo como ".env" (sin .txt ni .example al final).`)
        }
    }
} else {
    try {
        const bytes = fs.readFileSync(ruta)
        // El Bloc de notas o PowerShell a veces guardan con BOM o en UTF-16: se leen igual
        const texto = (bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.toString('utf16le') : bytes.toString('utf8'))
            .replace(/^\uFEFF/, '')
        const valores = parseEnv(texto)

        // Electron ya cargó %APPDATA%\CRAbook\.env antes de importar el servidor.
        // El .env del proyecto solo completa variables que todavía no existen;
        // nunca debe pisar la configuración específica de este equipo.
        for (const [clave, valor] of Object.entries(valores)) {
            if (process.env[clave] === undefined) process.env[clave] = valor
        }

        console.log(`[.env] Leído (sin sobrescribir variables existentes): ${ruta}`)
    } catch (error) {
        console.log(`[.env] No se pudo leer ${ruta}: ${error.message}`)
    }
}

console.log(process.env.IMPRESORA_TIPO
    ? `[impresora] Tipo: ${process.env.IMPRESORA_TIPO}, nombre: ${process.env.IMPRESORA_NOMBRE ?? '(sin definir)'}, destino: ${process.env.IMPRESORA_DESTINO ?? process.env.IMPRESORA_HOST ?? '(sin definir)'}`
    : '[impresora] Sin configurar (falta IMPRESORA_TIPO en el .env)')