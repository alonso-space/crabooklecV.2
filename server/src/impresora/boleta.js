
import net from 'node:net'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { sumarDiasHabiles } from '../plazo.js'
import { execFile } from 'node:child_process'

const COLUMNAS = 32
const ESC = 0x1b
const GS = 0x1d

const CP850 = {
    'á': 0xa0, 'é': 0x82, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3, 'ñ': 0xa4, 'Ñ': 0xa5,
    '¿': 0xa8, '¡': 0xad, 'ü': 0x81, 'Ü': 0x9a, 'Á': 0xb5, 'É': 0x90, 'Í': 0xd6,
    'Ó': 0xe0, 'Ú': 0xe9, '°': 0xf8
}

const sinTildes = (texto) =>
    texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

function codificar(texto) {
    const limpio = process.env.IMPRESORA_SIN_TILDES === 'true'
        ? sinTildes(texto)
        : texto

    return Buffer.from([...limpio].map(c =>
        CP850[c] ?? (c.charCodeAt(0) < 128 ? c.charCodeAt(0) : 0x3f)
    ))
}

function calcularFechaDevolucion(fechaPrestamo) {
    if (!fechaPrestamo) {
        throw new Error('No se recibió la fecha del préstamo.')
    }

    let fecha

    if (fechaPrestamo instanceof Date) {
        fecha = new Date(fechaPrestamo)
    } else {
        const valor = String(fechaPrestamo).trim()

        if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
            const [anio, mes, dia] = valor.split('-').map(Number)
            fecha = new Date(anio, mes - 1, dia)
        } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(valor)) {
            const [dia, mes, anio] = valor.split('/').map(Number)
            fecha = new Date(anio, mes - 1, dia)
        } else if (/^\d{2}-\d{2}-\d{4}$/.test(valor)) {
            const [dia, mes, anio] = valor.split('-').map(Number)
            fecha = new Date(anio, mes - 1, dia)
        } else {
            throw new Error(`Formato de fecha no reconocido: ${valor}`)
        }
    }

    if (Number.isNaN(fecha.getTime())) {
        throw new Error('La fecha del préstamo no es válida.')
    }
    
    fecha = sumarDiasHabiles(fecha)

    return fecha.toLocaleDateString('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    })
}

function envolver(texto, ancho = COLUMNAS) {
    const lineas = []

    for (const parrafo of String(texto ?? '').split('\n')) {
        let actual = ''

        for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
            let resto = palabra

            while (resto.length > ancho) {
                if (actual) {
                    lineas.push(actual)
                    actual = ''
                }

                lineas.push(resto.slice(0, ancho))
                resto = resto.slice(ancho)
            }

            if (!actual) actual = resto
            else if ((actual + ' ' + resto).length <= ancho) {
                actual += ' ' + resto
            } else {
                lineas.push(actual)
                actual = resto
            }
        }

        lineas.push(actual)
    }

    return lineas
}


function codigoBarras(valor) {
    const codigo = String(valor ?? '').trim()

    if (!codigo) {
        throw new Error('El código de barras está vacío.')
    }

    if (!/^[\x20-\x7E]+$/.test(codigo)) {
        throw new Error('El código contiene caracteres no válidos para CODE128.')
    }

    const contenido = Buffer.from('{B' + codigo, 'ascii')

    if (contenido.length > 250) {
        throw new Error('El código de barras es demasiado largo.')
    }

    const partes = []

    // Centrar código de barras
    partes.push(Buffer.from([ESC, 0x61, 1]))

    // Altura
    partes.push(Buffer.from([GS, 0x68, 80]))

    // Ancho: 2
    partes.push(Buffer.from([GS, 0x77, 2]))

    // Mostrar números debajo
    partes.push(Buffer.from([GS, 0x48, 2]))

    // CODE128 B: misma secuencia de la prueba exitosa
    partes.push(Buffer.from([GS, 0x6b, 0x49]))
    partes.push(Buffer.from([0x0a]))
    partes.push(contenido)
    partes.push(Buffer.from([0x0a]))

    // Restaurar alineación
    partes.push(Buffer.from([ESC, 0x61, 0]))

    return Buffer.concat(partes)
}



export function armarBoleta(p) {
    console.log('FECHA RECIBIDA:', p.FECHA_ENTREGA)
    console.log('FECHA DEVOLUCIÓN:', p.FECHA_DEVOLUCION)
    console.log('ESTADO:', p.ESTADO_LIBRO)

    const partes = []

    const fechaDevolucion = p.ESTADO_LIBRO === 'Devuelto'
        ? p.FECHA_DEVOLUCION
        : calcularFechaDevolucion(p.FECHA_ENTREGA)

    const cmd = (...bytes) => partes.push(Buffer.from(bytes))

    const linea = (texto = '') =>
        partes.push(codificar(texto), Buffer.from([0x0a]))

    const lineas = (texto) =>
        envolver(texto).forEach(l => linea(l))

    const separador = () =>
        linea('-'.repeat(COLUMNAS))

    const dato = (titulo, valor) => {
        cmd(ESC, 0x45, 1)
        linea(titulo)
        cmd(ESC, 0x45, 0)
        lineas(valor)
    }

    cmd(ESC, 0x40)

    cmd(
        ESC,
        0x74,
        Number(process.env.IMPRESORA_CODEPAGE ?? 2)
    )

    cmd(ESC, 0x61, 1)
    cmd(GS, 0x21, 0x11)
    cmd(ESC, 0x45, 1)

    linea('CRAbook')

    cmd(GS, 0x21, 0x00)
    cmd(ESC, 0x45, 0)

    linea('Boleta de préstamo')
    linea(`N° ${p.ID_PRESTAR}`)

    cmd(ESC, 0x61, 0)

    separador()

    dato('Fecha préstamo:', p.FECHA_ENTREGA)

    dato(
        p.ESTADO_LIBRO === 'Devuelto'
            ? 'Fecha de devolución:'
            : 'Devolver antes del:',
        fechaDevolucion || 'Sin fecha registrada'
    )

    dato('Libro:', p.TITULO)
    dato('Autor:', p.AUTOR)

    cmd(ESC, 0x45, 1)
    linea('Código de barras:')
    cmd(ESC, 0x45, 0)

    partes.push(codigoBarras(p.CODIGO_DE_BARRA))

    separador()

    dato('Prestado a:', p.NOMBRE_USUARIO)
    dato('RUT:', p.RUT_USUARIO)

    separador()

    cmd(ESC, 0x61, 1)

lineas('Conserve esta boleta.\nRecuerde devolver el libro.\nAsí nos gusta el LEC')

    cmd(ESC, 0x64, 5)

    return Buffer.concat(partes)
}

function enviarPorRed(datos) {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection({
            host: process.env.IMPRESORA_HOST,
            port: Number(process.env.IMPRESORA_PUERTO ?? 9100)
        })

        let terminado = false

        const fallar = (error) => {
            if (terminado) return
            terminado = true
            socket.destroy()
            reject(error)
        }

        socket.setTimeout(5000, () => {
            fallar(new Error('La impresora no responde (tiempo agotado).'))
        })

        socket.on('error', e => {
            fallar(new Error(
                `No se pudo conectar con la impresora: ${e.message}`
            ))
        })

        socket.on('connect', () => {
            socket.end(datos)
        })

        socket.on('close', conError => {
            if (terminado) return
            terminado = true

            if (!conError) resolve()
            else reject(new Error('La conexión con la impresora se cerró inesperadamente.'))
        })
    })
}

async function enviarLocal(datos) {
    const destino = process.env.IMPRESORA_DESTINO

    if (!destino) {
        throw new Error('Falta IMPRESORA_DESTINO en el archivo .env.')
    }

    if (process.platform !== 'win32') {
        return fs.writeFile(destino, datos)
    }

    const archivo = path.join(
        os.tmpdir(),
        `boleta-${Date.now()}.bin`
    )

    await fs.writeFile(archivo, datos)

    try {
        await new Promise((resolve, reject) => {
            execFile(
                'cmd',
                ['/c', 'copy', '/b', archivo, destino],
                (error, salida, stderr) => {
                    const resultado = String(salida ?? '') +
                        String(stderr ?? '')

                    if (error || !/\b1\b/.test(resultado)) {
                        return reject(
                            new Error(
                                `No se pudo enviar a la impresora (${destino}). ${resultado.trim()}`
                            )
                        )
                    }

                    resolve()
                }
            )
        })
    } finally {
        fs.unlink(archivo).catch(() => {})
    }
}

const RAW_PRINT_SCRIPT = `param([string]$Impresora, [string]$Archivo)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class RawPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DOCINFO {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }
    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool OpenPrinter(string name, out IntPtr h, IntPtr d);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool ClosePrinter(IntPtr h);
    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern int StartDocPrinter(IntPtr h, int level, ref DOCINFO di);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool EndDocPrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool StartPagePrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool EndPagePrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool WritePrinter(IntPtr h, byte[] buf, int count, out int written);
    public static void Send(string printer, byte[] data) {
        IntPtr h;
        if (!OpenPrinter(printer, out h, IntPtr.Zero))
            throw new Exception("No se pudo abrir la impresora (error " + Marshal.GetLastWin32Error() + ").");
        try {
            DOCINFO di = new DOCINFO();
            di.pDocName = "Boleta CRAbook";
            di.pOutputFile = null;
            di.pDataType = "RAW";
            if (StartDocPrinter(h, 1, ref di) == 0)
                throw new Exception("La impresora rechazo el documento (error " + Marshal.GetLastWin32Error() + ").");
            try {
                if (!StartPagePrinter(h))
                    throw new Exception("No se pudo iniciar la pagina (error " + Marshal.GetLastWin32Error() + ").");
                try {
                    int escritos;
                    if (!WritePrinter(h, data, data.Length, out escritos) || escritos != data.Length)
                        throw new Exception("No se pudieron enviar todos los datos a la impresora.");
                } finally { EndPagePrinter(h); }
            } finally { EndDocPrinter(h); }
        } finally { ClosePrinter(h); }
    }
}
'@
try {
    [RawPrinter]::Send($Impresora, [System.IO.File]::ReadAllBytes($Archivo))
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
`

const POWERSHELL_ARGS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass']
const LOOKS_THERMAL = /PR-?100|POS|thermal|termic|receipt|ticket|recibo|boleta|58|80mm/i

const run = (archivo, args, opciones = {}) => new Promise((resolve, reject) => {
    execFile(archivo, args, { encoding: 'utf8', windowsHide: true, timeout: 20000, ...opciones }, (error, salida, stderr) => {
        if (error) return reject(new Error((String(stderr).trim() || error.message)))
        resolve(String(salida))
    })
})

// Lista las impresoras instaladas en Windows con su puerto (USB001, USB002, IP_..., etc.)
async function listPrinters() {
    const salida = await run('powershell.exe', [
        ...POWERSHELL_ARGS, '-Command',
        '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-CimInstance Win32_Printer | Select-Object Name,PortName | ConvertTo-Json -Compress'
    ])
    if (!salida.trim()) return []

    const datos = JSON.parse(salida)
    return (Array.isArray(datos) ? datos : [datos])
        .filter(i => i && typeof i.Name === 'string' && i.Name.trim())
        .map(i => ({ Name: i.Name.trim(), PortName: String(i.PortName ?? '').trim() }))
}

// Busca la impresora instalada en Windows. Si se especifica un nombre,
// exige que coincida y que esté asociada a un puerto USB.
export async function detectUsbPrinter() {
    const lista = await listPrinters()
    const nombreConfigurado = String(process.env.IMPRESORA_NOMBRE ?? '').trim()
    const normalizar = valor => String(valor ?? '').trim().toLocaleLowerCase('es-CL')

    if (nombreConfigurado) {
        const buscado = normalizar(nombreConfigurado)
        const match = lista.find(i => normalizar(i.Name) === buscado) ??
            lista.find(i => normalizar(i.Name).includes(buscado))

        if (!match) {
            const instaladas = lista.map(i => `${i.Name} (puerto: ${i.PortName || 'desconocido'})`)
            throw new Error(`No se encontró la impresora "${nombreConfigurado}". Impresoras detectadas por Windows: ${instaladas.join('; ') || 'ninguna'}. Copia el nombre exacto que aparece en Get-Printer.`)
        }

        if (!/^USB/i.test(match.PortName)) {
            throw new Error(`La impresora "${match.Name}" está instalada en el puerto "${match.PortName || 'desconocido'}", no en un puerto USB. Revisa la conexión y el puerto en las propiedades de la impresora.`)
        }

        return match.Name
    }

    const usb = lista.filter(i => /^USB/i.test(i.PortName))
    if (usb.length === 0) {
        throw new Error(`Windows no detectó impresoras en puertos USB. Impresoras instaladas: ${lista.map(i => `${i.Name} (${i.PortName || 'sin puerto'})`).join('; ') || 'ninguna'}.`)
    }
    if (usb.length === 1) return usb[0].Name

    const thermal = usb.filter(i => LOOKS_THERMAL.test(i.Name))
    if (thermal.length === 1) return thermal[0].Name

    throw new Error(`Hay varias impresoras USB (${usb.map(i => i.Name).join(', ')}). Escribe el nombre exacto de la impresora de boletas en IMPRESORA_NOMBRE.`)
}

async function sendUsb(datos) {
    if (process.platform !== 'win32') {
        throw new Error('IMPRESORA_TIPO=usb solo funciona en Windows.')
    }

    const impresora = await detectUsbPrinter()
    const base = path.join(os.tmpdir(), `boleta-${Date.now()}`)
    const binFile = `${base}.bin`
    const psFile = `${base}.ps1`

    await fs.writeFile(binFile, datos)
    await fs.writeFile(psFile, '\uFEFF' + RAW_PRINT_SCRIPT, 'utf8')

    try {
        await run('powershell.exe', [...POWERSHELL_ARGS, '-File', psFile, '-Impresora', impresora, '-Archivo', binFile])
    } catch (error) {
        throw new Error(`No se pudo imprimir en "${impresora}". ${error.message}`)
    } finally {
        fs.unlink(binFile).catch(() => {})
        fs.unlink(psFile).catch(() => {})
    }
}


export async function imprimirBoleta(prestamo) {
    const tipo = process.env.IMPRESORA_TIPO

    if (!tipo) {
        throw new Error(
            'La impresora no está configurada (revisa IMPRESORA_TIPO en el archivo .env).'
        )
    }

    const datos = armarBoleta(prestamo)

    if (tipo === 'red') {
        return enviarPorRed(datos)
    }

    if (tipo === 'local') {
        return enviarLocal(datos)
    }

    if (tipo === 'usb') {
        return sendUsb(datos)
    }

    throw new Error(
        'IMPRESORA_TIPO debe ser "usb", "red" o "local".'
    )
}
