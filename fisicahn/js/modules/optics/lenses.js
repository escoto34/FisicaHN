export class Lenses {
  constructor() {
    this.canvas = null
    this.renderer = null
    this.width = 800
    this.height = 600

    this.tipo_lente = 'convergente'
    this.d0 = 40
    this.h0 = 3
    this.f = 25

    this.di = 0
    this.M = 0
    this.hi = 0
    this.categoria_real = ''
    this.categoria_orientacion = ''
    this.categoria_tamano = ''

    this.lensX = 500
    this.originY = 300
    this.scale = 3.0
    this.objectColor = '#00bcd4'
    this.imageColor = '#ff9800'
  }

  getControls() {
    return [
      {
        id: 'tipo_lente',
        label: 'Tipo de lente',
        type: 'select',
        default: 'convergente',
        options: [
          { value: 'convergente', label: 'Convergente' },
          { value: 'divergente', label: 'Divergente' }
        ]
      },
      {
        id: 'd0',
        label: 'Dist. objeto (d₀)',
        type: 'range',
        min: 5,
        max: 200,
        step: 1,
        default: 40,
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
        default: 25,
        unit: 'cm'
      }
    ]
  }

  getCharts() {
    return null
  }

  calculate() {
    const fVal = this.tipo_lente === 'convergente' ? this.f : -this.f

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
    this.lensX = this.width * 0.55
    this.calculate()
  }

  update(dt) {
    this.calculate()
  }

  reset() {
    this.d0 = 40
    this.h0 = 3
    this.f = 25
    this.tipo_lente = 'convergente'
    this.calculate()
  }

  toCanvasX(physX) {
    return this.lensX - physX * this.scale
  }

  toCanvasY(physY) {
    return this.originY - physY * this.scale
  }

  toPhysX(canvasX) {
    return (this.lensX - canvasX) / this.scale
  }

  drawGrid(ctx) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 0.5
    for (let x = 0; x <= this.width; x += 25) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, this.height)
      ctx.stroke()
    }
    for (let y = 0; y <= this.height; y += 25) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(this.width, y)
      ctx.stroke()
    }
    ctx.restore()
  }

  drawAxis(ctx) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])

    ctx.beginPath()
    ctx.moveTo(0, this.originY)
    ctx.lineTo(this.width, this.originY)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(this.lensX, 0)
    ctx.lineTo(this.lensX, this.height)
    ctx.stroke()

    ctx.setLineDash([])

    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.font = '11px Inter, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('eje óptico', this.lensX + 8, this.originY - 4)
    ctx.textAlign = 'center'
    ctx.fillText('eje principal', this.lensX, 14)
    ctx.restore()
  }

  drawLens(ctx) {
    const cx = this.lensX
    const cy = this.originY
    const halfHeight = 150
    const lensWidth = this.tipo_lente === 'convergente' ? 14 : 14

    ctx.save()

    if (this.tipo_lente === 'convergente') {
      ctx.strokeStyle = '#90caf9'
      ctx.lineWidth = 3
      ctx.fillStyle = 'rgba(144, 202, 249, 0.1)'

      ctx.beginPath()
      ctx.moveTo(cx - lensWidth / 2, cy - halfHeight)
      ctx.quadraticCurveTo(cx + lensWidth / 2, cy - halfHeight * 0.5, cx + lensWidth / 2, cy)
      ctx.quadraticCurveTo(cx + lensWidth / 2, cy + halfHeight * 0.5, cx - lensWidth / 2, cy + halfHeight)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(cx + lensWidth / 2, cy - halfHeight)
      ctx.quadraticCurveTo(cx - lensWidth / 2, cy - halfHeight * 0.5, cx - lensWidth / 2, cy)
      ctx.quadraticCurveTo(cx - lensWidth / 2, cy + halfHeight * 0.5, cx + lensWidth / 2, cy + halfHeight)
      ctx.stroke()

      ctx.fillStyle = '#90caf9'
      ctx.font = '11px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Lente Convergente', cx, cy + halfHeight + 22)

      ctx.fillStyle = '#ffeb3b'
      ctx.font = '10px Inter, sans-serif'
      const fPhys = this.f
      const fCx = this.toCanvasX(fPhys)
      ctx.fillText(`F (${fPhys} cm)`, fCx, cy + 16)
      const fCx2 = this.toCanvasX(-fPhys)
      ctx.fillText(`F' (${fPhys} cm)`, fCx2, cy + 16)
    } else {
      ctx.strokeStyle = '#90caf9'
      ctx.lineWidth = 3
      ctx.fillStyle = 'rgba(144, 202, 249, 0.1)'

      ctx.beginPath()
      ctx.moveTo(cx - lensWidth / 2, cy - halfHeight)
      ctx.quadraticCurveTo(cx + lensWidth / 2, cy - halfHeight * 0.5, cx + lensWidth / 2, cy)
      ctx.quadraticCurveTo(cx - lensWidth / 2, cy + halfHeight * 0.5, cx - lensWidth / 2, cy + halfHeight)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(cx + lensWidth / 2, cy - halfHeight)
      ctx.quadraticCurveTo(cx - lensWidth / 2, cy - halfHeight * 0.5, cx - lensWidth / 2, cy)
      ctx.quadraticCurveTo(cx + lensWidth / 2, cy + halfHeight * 0.5, cx + lensWidth / 2, cy + halfHeight)
      ctx.stroke()

      ctx.fillStyle = '#90caf9'
      ctx.font = '11px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Lente Divergente', cx, cy + halfHeight + 22)

      ctx.fillStyle = '#ffeb3b'
      ctx.font = '10px Inter, sans-serif'
      const fPhys = Math.abs(this.f)
      const fCx = this.toCanvasX(-fPhys)
      ctx.fillText(`F (${fPhys} cm)`, fCx, cy + 16)
    }

    ctx.restore()
  }

  drawFocusPoints(ctx) {
    const cx = this.lensX
    const cy = this.originY
    const fVal = this.tipo_lente === 'convergente' ? this.f : -this.f
    const fCx = this.toCanvasX(fVal)
    const negFCx = this.toCanvasX(-fVal)

    ctx.save()

    if (this.tipo_lente === 'convergente') {
      ctx.fillStyle = '#ffeb3b'
      ctx.beginPath()
      ctx.arc(fCx, cy, 4, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#ff9800'
      ctx.beginPath()
      ctx.arc(negFCx, cy, 4, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = 'rgba(255, 235, 59, 0.4)'
      ctx.font = '10px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('F', fCx, cy + 16)

      ctx.fillStyle = 'rgba(255, 152, 0, 0.4)'
      ctx.fillText("F'", negFCx, cy + 16)
    } else {
      ctx.fillStyle = '#ffeb3b'
      ctx.beginPath()
      ctx.arc(fCx, cy, 4, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = 'rgba(255, 235, 59, 0.4)'
      ctx.font = '10px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('F', fCx, cy + 16)

      ctx.fillStyle = '#ff9800'
      ctx.beginPath()
      ctx.arc(negFCx, cy, 4, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = 'rgba(255, 152, 0, 0.4)'
      ctx.fillText("F'", negFCx, cy + 16)
    }

    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.font = '10px Inter, sans-serif'
    const cxCenter = this.toCanvasX(0)
    ctx.fillText('Centro óptico', cxCenter, cy + 16)

    ctx.restore()
  }

  drawObject(ctx) {
    const x = this.toCanvasX(this.d0)
    const tipY = this.toCanvasY(this.h0)
    const baseY = this.originY

    if (x < 10 || x > this.lensX - 2) return

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

    if (x < 0 || x > this.width) {
      const labelX = this.di > 0 ? this.lensX + 20 : this.lensX - 80
      ctx.save()
      ctx.fillStyle = this.imageColor
      ctx.font = '10px Inter, sans-serif'
      ctx.textAlign = 'left'
      const direction = this.di > 0 ? '→' : '←'
      ctx.fillText(`Imagen (${Math.abs(this.di).toFixed(1)} cm) ${direction}`, labelX, 50)
      ctx.restore()
      return
    }

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

  drawRaysConvergent(ctx) {
    const cx = this.lensX
    const cy = this.originY
    const objX = this.toCanvasX(this.d0)
    const objTipY = this.toCanvasY(this.h0)
    const fCx = this.toCanvasX(this.f)
    const imgX = this.toCanvasX(this.di)
    const imgTipY = this.toCanvasY(this.hi)
    const fVal = this.f

    if (objX < 0) return

    ctx.save()
    ctx.setLineDash([])

    ctx.lineWidth = 1.8

    const hasValidImage = isFinite(this.di) && Math.abs(this.di) < 500

    const imgXClamped = hasValidImage ? Math.max(0, Math.min(this.width, imgX)) : this.width - 50
    const imgTipYClamped = hasValidImage ? imgTipY : cy - 80

    {
      ctx.strokeStyle = '#ef5350'
      ctx.globalAlpha = 0.85
      ctx.beginPath()
      ctx.moveTo(objX, objTipY)
      ctx.lineTo(cx, objTipY)
      ctx.stroke()

      ctx.strokeStyle = '#ef5350'
      ctx.globalAlpha = 0.65
      ctx.beginPath()
      ctx.moveTo(cx, objTipY)
      ctx.lineTo(imgXClamped, imgTipYClamped)
      ctx.stroke()

      ctx.fillStyle = '#ef5350'
      ctx.font = '10px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Rayo 1', (objX + cx) / 2, objTipY - 8)
    }

    {
      ctx.strokeStyle = '#66bb6a'
      ctx.globalAlpha = 0.85
      ctx.beginPath()
      ctx.moveTo(objX, objTipY)
      ctx.lineTo(cx, cy)
      ctx.stroke()

      ctx.strokeStyle = '#66bb6a'
      ctx.globalAlpha = 0.65
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(imgXClamped, imgTipYClamped)
      ctx.stroke()

      ctx.fillStyle = '#66bb6a'
      ctx.font = '10px Inter, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText('Rayo 2', (objX + cx) / 2 - 6, (objTipY + cy) / 2 + 4)
    }

    {
      ctx.strokeStyle = '#42a5f5'
      ctx.globalAlpha = 0.85
      if (this.d0 > this.f) {
        const dirX = fCx
        ctx.beginPath()
        ctx.moveTo(objX, objTipY)
        ctx.lineTo(cx, cy - (objTipY - cy) * (cx - fCx) / (objX - fCx))
        ctx.stroke()

        ctx.strokeStyle = '#42a5f5'
        ctx.globalAlpha = 0.65
        ctx.beginPath()
        ctx.moveTo(cx, cy - (objTipY - cy) * (cx - fCx) / (objX - fCx))
        ctx.lineTo(imgXClamped, imgTipYClamped)
        ctx.stroke()

        ctx.fillStyle = '#42a5f5'
        ctx.font = '10px Inter, sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText('Rayo 3', cx + 6, cy - (objTipY - cy) * (cx - fCx) / (objX - fCx) + 4)
      } else {
        const dirX = cx + (cx - fCx) * 2
        ctx.beginPath()
        ctx.moveTo(objX, objTipY)
        const hitY3 = cy - (objTipY - cy) * (cx - objX) / (dirX - objX)
        ctx.lineTo(cx, hitY3)
        ctx.stroke()

        ctx.strokeStyle = '#42a5f5'
        ctx.globalAlpha = 0.65
        ctx.beginPath()
        ctx.moveTo(cx, hitY3)
        ctx.lineTo(imgXClamped, imgTipYClamped)
        ctx.stroke()

        ctx.fillStyle = '#42a5f5'
        ctx.font = '10px Inter, sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText('Rayo 3', cx + 6, hitY3 + 4)
      }
    }

    ctx.restore()
  }

  drawRaysDivergent(ctx) {
    const cx = this.lensX
    const cy = this.originY
    const objX = this.toCanvasX(this.d0)
    const objTipY = this.toCanvasY(this.h0)
    const fCx = this.toCanvasX(-this.f)
    const imgX = this.toCanvasX(this.di)
    const imgTipY = this.toCanvasY(this.hi)

    if (objX < 0) return

    ctx.save()
    ctx.lineWidth = 1.8

    const hasValidImage = isFinite(this.di) && Math.abs(this.di) < 500

    const imgXClamped = hasValidImage ? Math.max(0, Math.min(this.width, imgX)) : 50
    const imgTipYClamped = hasValidImage ? imgTipY : cy - 80

    {
      ctx.strokeStyle = '#ef5350'
      ctx.globalAlpha = 0.85
      ctx.beginPath()
      ctx.moveTo(objX, objTipY)
      ctx.lineTo(cx, objTipY)
      ctx.stroke()

      ctx.strokeStyle = '#ef5350'
      ctx.globalAlpha = 0.55
      ctx.setLineDash([4, 4])
      const extX = cx + (cx - imgXClamped) * 0.8
      const extY = objTipY + (objTipY - imgTipYClamped) * 0.8
      ctx.beginPath()
      ctx.moveTo(cx, objTipY)
      ctx.lineTo(extX, extY)
      ctx.stroke()
      ctx.setLineDash([])

      ctx.fillStyle = '#ef5350'
      ctx.font = '10px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Rayo 1', (objX + cx) / 2, objTipY - 8)
    }

    {
      ctx.strokeStyle = '#66bb6a'
      ctx.globalAlpha = 0.85
      ctx.beginPath()
      ctx.moveTo(objX, objTipY)
      ctx.lineTo(cx, cy)
      ctx.stroke()

      ctx.strokeStyle = '#66bb6a'
      ctx.globalAlpha = 0.55
      ctx.setLineDash([4, 4])
      const extX = cx + (cx - imgXClamped) * 0.5
      const extY = cy + (cy - imgTipYClamped) * 0.5
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(extX, extY)
      ctx.stroke()
      ctx.setLineDash([])

      ctx.fillStyle = '#66bb6a'
      ctx.font = '10px Inter, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText('Rayo 2', (objX + cx) / 2 - 6, (objTipY + cy) / 2 + 4)
    }

    {
      ctx.strokeStyle = '#42a5f5'
      ctx.globalAlpha = 0.85
      const aimY = cy - (0 - objTipY) * (fCx - objX) / (cx - objX)
      ctx.beginPath()
      ctx.moveTo(objX, objTipY)
      ctx.lineTo(cx, aimY)
      ctx.stroke()

      ctx.strokeStyle = '#42a5f5'
      ctx.globalAlpha = 0.55
      ctx.setLineDash([4, 4])
      const extX3 = cx + 60
      const extY3 = aimY
      ctx.beginPath()
      ctx.moveTo(cx, aimY)
      ctx.lineTo(extX3, extY3)
      ctx.stroke()
      ctx.setLineDash([])

      ctx.fillStyle = '#42a5f5'
      ctx.font = '10px Inter, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('Rayo 3', cx + 6, aimY + 4)
    }

    ctx.restore()
  }

  drawInfoBox(ctx) {
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.roundRect(this.width - 210, 10, 200, 120, 8)
    ctx.fill()

    ctx.fillStyle = 'rgba(255,255,255,0.85)'
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
    this.drawLens(ctx)
    this.drawFocusPoints(ctx)
    this.drawObject(ctx)
    this.drawImage(ctx)

    if (this.tipo_lente === 'convergente') {
      this.drawRaysConvergent(ctx)
    } else {
      this.drawRaysDivergent(ctx)
    }

    this.drawInfoBox(ctx)

    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.font = '12px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`1/f = 1/d₀ + 1/dᵢ   |   dᵢ = ${isFinite(this.di) ? this.di.toFixed(1) : '∞'} cm`, this.width / 2, 22)
    ctx.restore()
  }
}
