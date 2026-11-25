import { app, BrowserWindow, dialog, Menu, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import http from 'node:http'
import crypto from 'node:crypto'
import { parseEnv } from 'node:util'
import { pathToFileURL } from 'node:url'

const PLANTILLA = `# Configuración de CRAbook para ESTE equipo.
# Guarda el archivo y vuelve a abrir CRAbook.

# --- Base de datos (servidor aparte) ---
DB_HOST=192.168.1.10
DB_PORT=3306
DB_USER=crabook
DB_PASSWORD=cambiar
DB_NAME=db-crabook

# --- Impresora de boletas (térmica, USB) ---
# usb = detecta sola la impresora conectada por USB
# Si hay varias, escribe el nombre tal como aparece en Get-Printer (ej: AON PR-100)
IMPRESORA_TIPO=usb
IMPRESORA_NOMBRE=
IMPRESORA_CODEPAGE=2
IMPRESORA_SIN_TILDES=false
`

const bloqueo = app.requestSingleInstanceLock()
if (!bloqueo) {
    app.quit()
} else {
    let ventana = null
    app.on('second-instance', () => {
        if (!ventana) return
        if (ventana.isMinimized()) ventana.restore()
        ventana.focus()
    })

    const carpeta = app.getPath('userData')             // %APPDATA%\CRAbook
    const rutaEnv = path.join(carpeta, '.env')
    const rutaSecreto = path.join(carpeta, '.auth-secret')

    const puertoLibre = (preferido) => new Promise((resolver) => {
        const probar = (puerto) => {
            const s = net.createServer()
            s.once('error', () => (puerto === 0 ? resolver(0) : probar(0)))
            s.once('listening', () => {
                const { port } = s.address()
                s.close(() => resolver(port))
            })
            s.listen(puerto, '127.0.0.1')
        }
        probar(preferido)
    })

    const esperarServidor = (puerto, intentos = 60) => new Promise((resolver, rechazar) => {
        const probar = (n) => {
            const req = http.get({ host: '127.0.0.1', port: puerto, path: '/', timeout: 1000 }, (res) => {
                res.resume()
                resolver()
            })
            req.on('error', () => (n <= 0 ? rechazar(new Error('El servidor interno no respondió.')) : setTimeout(() => probar(n - 1), 250)))
            req.on('timeout', () => req.destroy())
        }
        probar(intentos)
    })

    app.whenReady().then(async () => {
        Menu.setApplicationMenu(null)
        fs.mkdirSync(carpeta, { recursive: true })

        // Primera vez: se crea la configuración y se abre para editarla
        if (!fs.existsSync(rutaEnv)) {
            fs.writeFileSync(rutaEnv, PLANTILLA)
            await dialog.showMessageBox({
                type: 'info',
                title: 'CRAbook - primera configuración',
                message: 'Falta configurar la conexión a la base de datos.',
                detail: `Se abrirá el archivo de configuración.\nEscribe la IP del servidor y la contraseña, guarda y vuelve a abrir CRAbook.\n\n${rutaEnv}`
            })
            await shell.openPath(rutaEnv)
            app.quit()
            return
        }

        if (!fs.existsSync(rutaSecreto)) fs.writeFileSync(rutaSecreto, crypto.randomBytes(48).toString('hex'))

        try {
            const texto = fs.readFileSync(rutaEnv, 'utf8').replace(/^\uFEFF/, '')
            Object.assign(process.env, parseEnv(texto))
            process.env.AUTH_SECRET = fs.readFileSync(rutaSecreto, 'utf8').trim()
            process.env.HOST = '127.0.0.1'                       // la app NO queda expuesta en la red
            process.env.PORT = String(await puertoLibre(Number(process.env.PORT) || 8085))

            await import(pathToFileURL(path.join(app.getAppPath(), 'server', 'app.js')).href)
            await esperarServidor(Number(process.env.PORT))
        } catch (error) {
            dialog.showErrorBox('CRAbook no pudo iniciar', `${error.message}\n\nConfiguración: ${rutaEnv}`)
            app.quit()
            return
        }

        ventana = new BrowserWindow({
            width: 1366,
            height: 820,
            title: 'CRAbook',
            icon: path.join(app.getAppPath(), 'client', 'dist', 'img', 'logo.png'),
            autoHideMenuBar: true,
            webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
        })
        ventana.maximize()
        ventana.loadURL(`http://127.0.0.1:${process.env.PORT}`)

        // Enlaces externos al navegador, nunca dentro de la app
        ventana.webContents.setWindowOpenHandler(({ url }) => {
            shell.openExternal(url)
            return { action: 'deny' }
        })
        ventana.on('closed', () => { ventana = null })
    })

    app.on('window-all-closed', () => app.quit())
}
