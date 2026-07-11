export class Reflection {
  constructor() {
    this.canvas = null
    this.renderer = null
    this.width = 800
    this.height = 600

    this.tipo_espejo = 'concavo'
    this.d0 = 30
    this.h0 = 3
    this.f = 20

    this.di = 0
    this.M = 0
    this.hi = 0
    this.categoria_real = ''
    this.categoria_orientacion = ''
    this.categoria_tamano = ''

    this.mirrorX = 500
    this.originY = 300
    this.scale = 3.5
    this.objectColor = '#00bcd4'
    this.imageColor = '#ff9800'
  }

  getControls() {
    return [
      {
        id: 'tipo_espejo',
        label: 'Tipo de espejo',
        type: 'select',
        default: 'concavo',
        options: [
          { value: 'plano', label: 'Plano' },
          { value: 'concavo', label: 'Cóncavo' },
          { value: 'convexo', label: 'Convexo' }
        ]
      },
      {
        id: 'd0',
        label: 'Dist. objeto (d₀)',
        type: 'range',
        min: 5,
        max: 200,
        step: 1,
        default: 30,
        unit: 'cm'
      },
      {
        id: 'h0',
        label: 'Altura objeto (h₀)',
        type: 'range',
        min: 1,
        max: 10,
        step: 0.5,
        default: 3,
        unit: 'cm'
      },
      {
        id: 'f',
        label: 'Dist. focal (f)',
        type: 'range',
        min: 5,
        max: 100,
        step: 1,
        default: 20,
        unit: 'cm'
      }
    ]
  }

  getCharts() {
    return null
  }

  calculate() {
    const fVal = this.tipo_espejo === 'concavo' ? this.f : this.tipo_espejo === 'convexo' ? -this.f : Infinity

    if (this.tipo_espejo === 'plano') {
      this.di = -this.d0
      this.M = 1
      this.hi = this.h0
      this.categoria_real = 'virtual'
      this.categoria_orientacion = 'derecha'
      this.categoria_tamano = 'igual'
      return
    }

    if (Math.abs(this.d0 - fVal) < 1e-10) {
      this.di = Infinity
      this.M = Infinity
      this.hi = Infinity
      this.categoria_real = '—'
      this.categoria_orientacion = '—'
      this.categoria_tamano = '—'
      return
    }

    this.di = (this.d0 * fVal) / (this.d0 - fVal)
    this.M = -this.di / this.d0
    this.hi = this.M * this.h0

    if (this.di > 0) {
      this.categoria_real = 'real'
      this.categoria_orientacion = this.hi > 0 ? 'derecha' : 'invertida'
    } else {
      this.categoria_real = 'virtual'
      this.categoria_orientacion = this.hi > 0 ? 'derecha' : 'invertida'
    }

    const absM = Math.abs(this.M)
    if (Math.abs(absM - 1) < 0.01) {
      this.categoria_tamano = 'igual'
    } else if (absM > 1) {
      this.categoria_tamano = 'aumentada'
    } else {
      this.categoria_tamano = 'reducida'
    }
  }

  init(canvas, renderer) {
    this.canvas = canvas
    this.renderer = renderer
    this.width = canvas.width
    this.height = canvas.height
    this.originY = this.height / 2
    this.mirrorX = this.width * 0.65
    this.calculate()
  }

  update(dt) {
    this.calculate()
  }

  reset() {
    this.d0 = 30
    this.h0 = 3
    this.f = 20
    this.tipo_espejo = 'concavo'
    this.calculate()
  }

  toCanvasX(physX) {
    return this.mirrorX - physX * this.scale
  }

  toCanvasY(physY) {
    return this.originY - physY * this.scale
  }

  toPhysX(canvasX) {
    return (this.mirrorX - canvasX) / this.scale
  }

  drawGrid(ctx) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 0.5
    const step = 20
    for (let x = 0; x <= this.width; x += step) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, this.height)
      ctx.stroke()
    }
    for (let y = 0; y <= this.height; y += step) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(this.width, y)
      ctx.stroke()
    }
    ctx.restore()
  }

  drawAxis(ctx) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])

    ctx.beginPath()
    ctx.moveTo(0, this.originY)
    ctx.lineTo(this.width, this.originY)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(this.mirrorX, 0)
    ctx.lineTo(this.mirrorX, this.height)
    ctx.stroke()

    ctx.setLineDash([])

    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.font = '12px Inter, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('eje óptico', this.mirrorX + 8, this.originY - 4)
    ctx.textAlign = 'center'
    ctx.fillText('eje principal', this.mirrorX, 14)
    ctx.restore()
  }

  drawMirror(ctx) {
    const cx = this.mirrorX
    const cy = this.originY
    const halfHeight = 180

    ctx.save()

    if (this.tipo_espejo === 'plano') {
      ctx.strokeStyle = '#90caf9'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(cx, cy - halfHeight)
      ctx.lineTo(cx, cy + halfHeight)
      ctx.stroke()

      ctx.fillStyle = 'rgba(144, 202, 249, 0.12)'
      ctx.fillRect(cx - 3, cy - halfHeight, 6, halfHeight * 2)

      ctx.fillStyle = '#90caf9'
      ctx.font = '11px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Espejo Plano', cx, cy + halfHeight + 18)
    } else if (this.tipo_espejo === 'concavo') {
      const r = this.f * 2 * this.scale
      ctx.strokeStyle = '#90caf9'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(cx + r, cy, r, Math.PI * 0.85, Math.PI * 0.15, true)
      ctx.stroke()

      ctx.fillStyle = 'rgba(144, 202, 249, 0.08)'
      ctx.beginPath()
      ctx.arc(cx + r, cy, r, Math.PI * 0.85, Math.PI * 0.15, true)
      ctx.closePath()
      ctx.fill()

      ctx.fillStyle = '#90caf9'
      ctx.font = '11px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Espejo Cóncavo', cx, cy + halfHeight + 18)

      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.font = '10px Inter, sans-serif'
      const fPhys = this.f
      const fCx = this.toCanvasX(fPhys)
      ctx.fillText(`F (${fPhys} cm)`, fCx, cy + 16)
      const cCx = this.toCanvasX(2 * fPhys)
      ctx.fillText(`C (${2 * fPhys} cm)`, cCx, cy + 16)
    } else {
      const r = Math.abs(this.f) * 2 * this.scale
      ctx.strokeStyle = '#90caf9'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(cx - r, cy, r, Math.PI * 0.85, Math.PI * 0.15, false)
      ctx.stroke()

      ctx.fillStyle = 'rgba(144, 202, 249, 0.08)'
      ctx.beginPath()
      ctx.arc(cx - r, cy, r, Math.PI * 0.85, Math.PI * 0.15, false)
      ctx.closePath()
      ctx.fill()

      ctx.fillStyle = '#90caf9'
      ctx.font = '11px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Espejo Convexo', cx, cy + halfHeight + 18)

      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.font = '10px Inter, sans-serif'
      const fPhys = Math.abs(this.f)
      const fCx = this.toCanvasX(-fPhys)
      ctx.fillText(`F (${fPhys} cm)`, fCx, cy + 16)
      const cCx = this.toCanvasX(-2 * fPhys)
      ctx.fillText(`C (${2 * fPhys} cm)`, cCx, cy + 16)
    }

    ctx.restore()
  }

  drawFocusPoints(ctx) {
    if (this.tipo_espejo === 'plano') return
    const cx = this.mirrorX
    const cy = this.originY
    const fPhys = this.tipo_espejo === 'concavo' ? this.f : -Math.abs(this.f)
    const fCx = this.toCanvasX(fPhys)
    const cCx = this.toCanvasX(2 * fPhys)

    ctx.save()

    ctx.fillStyle = '#ffeb3b'
    ctx.beginPath()
    ctx.arc(fCx, cy, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 235, 59, 0.5)'
    ctx.font = '10px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('F', fCx, cy + 16)

    ctx.fillStyle = '#ff9800'
    ctx.beginPath()
    ctx.arc(cCx, cy, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 152, 0, 0.5)'
    ctx.fillText('C', cCx, cy + 16)

    ctx.restore()
  }

  drawObject(ctx) {
    const x = this.toCanvasX(this.d0)
    const tipY = this.toCanvasY(this.h0)
    const baseY = this.originY

    ctx.save()
    ctx.strokeStyle = this.objectColor
    ctx.fillStyle = this.objectColor
    ctx.lineWidth = 2.5

    ctx.beginPath()
    ctx.moveTo(x, baseY)
    ctx.lineTo(x, tipY)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(x - 6, tipY + 8)
    ctx.lineTo(x, tipY)
    ctx.lineTo(x + 6, tipY + 8)
    ctx.stroke()

    ctx.font = '11px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`Objeto (${this.d0} cm)`, x, baseY + 18)

    ctx.restore()
  }

  drawImage(ctx) {
    if (!isFinite(this.di) || Math.abs(this.di) > 500) return

    const x = this.toCanvasX(this.di)
    const tipY = this.toCanvasY(this.hi)
    const baseY = this.originY

    ctx.save()
    ctx.strokeStyle = this.imageColor
    ctx.fillStyle = this.imageColor
    ctx.lineWidth = 2.5
    ctx.setLineDash([5, 4])

    ctx.beginPath()
    ctx.moveTo(x, baseY)
    ctx.lineTo(x, tipY)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(x - 6, tipY + 8)
    ctx.lineTo(x, tipY)
    ctx.lineTo(x + 6, tipY + 8)
    ctx.stroke()

    ctx.setLineDash([])

    ctx.font = '11px Inter, sans-serif'
    ctx.textAlign = 'center'
    const imgLabel = `Imagen (${Math.abs(this.di).toFixed(1)} cm)`
    ctx.fillText(imgLabel, x, tipY < baseY ? tipY - 12 : baseY + 35)

    ctx.restore()
  }

  drawRays(ctx) {
    if (!isFinite(this.di) || Math.abs(this.di) > 500) return

    const cx = this.mirrorX
    const cy = this.originY
    const objX = this.toCanvasX(this.d0)
    const objTipY = this.toCanvasY(this.h0)
    const imgX = this.toCanvasX(this.di)
    const imgTipY = this.toCanvasY(this.hi)
    const fPhys = this.tipo_espejo === 'concavo' ? this.f : -Math.abs(this.f)
    const fCx = this.toCanvasX(fPhys)
    const cCx = this.toCanvasX(2 * fPhys)

    const isConcave = this.tipo_espejo === 'concavo'
    const isConvex = this.tipo_espejo === 'convexo'

    ctx.save()
    ctx.lineWidth = 1.8

    const mirrorSurfaceX = cx

    function intersectLine(x1, y1, x2, y2, mx) {
      if (Math.abs(x2 - x1) < 0.01) return { x: mx, y: y1 }
      const t = (mx - x1) / (x2 - x1)
      return { x: mx, y: y1 + t * (y2 - y1) }
    }

    if (!isConvex) {
      const r1EndX = imgX
      const r1EndY = imgTipY

      ctx.strokeStyle = '#ef5350'
      ctx.globalAlpha = 0.85
      ctx.beginPath()
      ctx.moveTo(objX, objTipY)
      const hit1 = intersectLine(objX, objTipY, r1EndX, r1EndY, mirrorSurfaceX)
      ctx.lineTo(hit1.x, hit1.y)
      ctx.stroke()

      if (isFinite(r1EndX)) {
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(hit1.x, hit1.y)
        ctx.lineTo(r1EndX, r1EndY)
        ctx.stroke()
        ctx.setLineDash([])
      }

      ctx.fillStyle = '#ef5350'
      ctx.font = '10px Inter, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('Rayo 1', mirrorSurfaceX + 6, hit1.y - 6)
    }

    {
      const r2EndX = imgX
      const r2EndY = imgTipY

      ctx.strokeStyle = '#42a5f5'
      ctx.globalAlpha = 0.85
      ctx.beginPath()
      const hit2 = intersectLine(objX, objTipY, r2EndX, r2EndY, mirrorSurfaceX)
      ctx.moveTo(objX, objTipY)
      ctx.lineTo(hit2.x, hit2.y)
      ctx.stroke()

      if (isFinite(r2EndX)) {
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(hit2.x, hit2.y)
        ctx.lineTo(r2EndX, r2EndY)
        ctx.stroke()
        ctx.setLineDash([])
      }

      ctx.fillStyle = '#42a5f5'
      ctx.font = '10px Inter, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('Rayo 2', mirrorSurfaceX + 6, hit2.y + 14)
    }

    {
      const r3EndX = imgX
      const r3EndY = imgTipY

      ctx.strokeStyle = '#66bb6a'
      ctx.globalAlpha = 0.85
      ctx.beginPath()
      const hit3 = intersectLine(objX, objTipY, r3EndX, r3EndY, mirrorSurfaceX)
      ctx.moveTo(objX, objTipY)
      ctx.lineTo(hit3.x, hit3.y)
      ctx.stroke()

      if (isFinite(r3EndX)) {
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(hit3.x, hit3.y)
        ctx.lineTo(r3EndX, r3EndY)
        ctx.stroke()
        ctx.setLineDash([])
      }

      ctx.fillStyle = '#66bb6a'
      ctx.font = '10px Inter, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('Rayo 3', mirrorSurfaceX + 6, hit3.y + 32)
    }

    ctx.restore()
  }

  drawInfo(ctx) {
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.roundRect(this.width - 210, 10, 200, 120, 8)
    ctx.fill()

    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.font = '11px Inter, sans-serif'
    ctx.textAlign = 'left'

    const lines = [
      `d₀ = ${this.d0} cm    dᵢ = ${isFinite(this.di) ? this.di.toFixed(1) : '∞'} cm`,
      `h₀ = ${this.h0} cm    hᵢ = ${isFinite(this.hi) ? Math.abs(this.hi).toFixed(1) : '∞'} cm`,
      `M = ${isFinite(this.M) ? this.M.toFixed(3) : '∞'}`,
      `${this.categoria_real} | ${this.categoria_orientacion} | ${this.categoria_tamano}`
    ]

    lines.forEach((text, i) => {
      ctx.fillText(text, this.width - 200, 32 + i * 22)
    })

    ctx.restore()
  }

  render(ctx) {
    ctx.clearRect(0, 0, this.width, this.height)

    this.drawGrid(ctx)
    this.drawAxis(ctx)
    this.drawMirror(ctx)
    this.drawFocusPoints(ctx)
    this.drawObject(ctx)
    this.drawImage(ctx)
    this.drawRays(ctx)
    this.drawInfo(ctx)

    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.font = '12px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`1/f = 1/d₀ + 1/dᵢ   |   dᵢ = ${isFinite(this.di) ? this.di.toFixed(1) : '∞'} cm`, this.width / 2, 22)
    ctx.restore()
  }
}
