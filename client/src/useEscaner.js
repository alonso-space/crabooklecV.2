import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

// La pistola lectora USB funciona como un teclado: "escribe" el código y pulsa Enter.
// Una persona no teclea tan rápido, así que se distingue por el tiempo entre teclas.
const MAX_ENTRE_TECLAS = 60   // milisegundos
const LARGO_MINIMO = 4

// Si se escanea fuera de un campo de texto, se abre el catálogo con el código ya buscado
export function useEscaner(activo) {
    const navegar = useNavigate()

    useEffect(() => {
        if (!activo) return
        let buffer = ''
        let ultima = 0

        const alTeclear = (e) => {
            if (e.ctrlKey || e.altKey || e.metaKey) return
            const t = e.target
            const enCampo = t instanceof HTMLElement &&
                (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
            if (enCampo) { buffer = ''; return }   // dentro de un campo la pistola escribe normal

            const ahora = performance.now()
            if (ahora - ultima > MAX_ENTRE_TECLAS) buffer = ''
            ultima = ahora

            if (e.key === 'Enter') {
                if (buffer.length >= LARGO_MINIMO) {
                    e.preventDefault()
                    navegar('/libros', { state: { codigo: buffer, escaneo: Date.now() } })
                }
                buffer = ''
                return
            }
            if (e.key.length === 1) buffer += e.key
        }

        window.addEventListener('keydown', alTeclear, true)
        return () => window.removeEventListener('keydown', alTeclear, true)
    }, [activo, navegar])
}
