export class Refraction {
  constructor() {
    this.canvas = null
    this.renderer = null
    this.width = 800
    this.height = 600

    this.n1 = 1.0
    this.n2 = 1.33
    this.theta1 = 30

    this.theta2 = 0
    this.theta_r = 0
    this.criticalAngle = 0
    this.isTIR = false
    this.presets = {
      1: { label: 'Aire', n: 1.0 },
      1.33: { label: 'Agua', n: 1.33 },
      1.5: { label: 'Vidrio', n: 1.5 },
      2.42: { label: 'Diamante', n: 2.42 }
    }

    this.boundaryY = 300
    this.intersectX = 300
    this.rayLength = 250
  }

  getControls() {
    return [
      {
        id: 'n1',
        label: 'n₁ (medio superior)',
        type: 'range',
        min: 1.0,
        max: 2.5,
        step: 0.01,
        default: 1.0
      },
      {
        id: 'n2',
        label: 'n₂ (medio inferior)',
        type: 'range',
        min: 1.0,
        max: 2.5,
        step: 0.01,
        default: 1.33
      },
      {
        id: 'theta1',
        label: 'θ₁ (incidencia)',
        type: 'range',
        min: 0,
        max: 89,
        step: 1,
        default: 30,
        unit: '°'
      }
    ]
  }

  getCharts() {
    return null
  }

  calculate() {
    const theta1Rad = (this.theta1 * Math.PI) / 180
    const sinTheta2 = (this.n1 / this.n2) * Math.sin(theta1Rad)

    if (this.n1 > this.n2) {
      this.criticalAngle = Math.asin(this.n2 / this.n1) * (180 / Math.PI)
    } else {
      this.criticalAngle = 0
    }

    this.theta_r = this.theta1

    if (sinTheta2 > 1) {
      this.isTIR = true
      this.theta2 = 0
    } else {
      this.isTIR = false
      this.theta2 = Math.asin(sinTheta2) * (180 / Math.PI)
    }
  }

  init(canvas, renderer) {
    this.canvas = canvas
    this.renderer = renderer
    this.width = canvas.width
    this.height = canvas.height
    this.boundaryY = this.height / 2
    this.intersectX = this.width * 0.4
    this.calculate()
  }

  update(dt) {
    this.calculate()
  }

  reset() {
    this.n1 = 1.0
    this.n2 = 1.33
    this.theta1 = 30
    this.calculate()
  }

  degToRad(deg) {
    return (deg * Math.PI) / 180
  }

  drawGrid(ctx) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.03)'
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

  drawMediaLabels(ctx) {
    ctx.save()

    const grad1 = ctx.createLinearGradient(0, 0, 0, this.boundaryY)
    grad1.addColorStop(0, 'rgba(100, 181, 246, 0.08)')
    grad1.addColorStop(1, 'rgba(100, 181, 246, 0.02)')
    ctx.fillStyle = grad1
    ctx.fillRect(0, 0, this.width, this.boundaryY)

    const grad2 = ctx.createLinearGradient(0, this.boundaryY, 0, this.height)
    grad2.addColorStop(0, 'rgba(129, 199, 132, 0.08)')
    grad2.addColorStop(1, 'rgba(129, 199, 132, 0.02)')
    ctx.fillStyle = grad2
    ctx.fillRect(0, this.boundaryY, this.width, this.height - this.boundaryY)

    ctx.fillStyle = 'rgba(100, 181, 246, 0.6)'
    ctx.font = '13px Inter, sans-serif'
    ctx.textAlign = 'center'
    const n1Label = this.getPresetLabel(this.n1)
    ctx.fillText(`Medio 1: ${n1Label} (n₁ = ${this.n1.toFixed(2)})`, this.width / 2, 30)

    ctx.fillStyle = 'rgba(129, 199, 132, 0.6)'
    const n2Label = this.getPresetLabel(this.n2)
    ctx.fillText(`Medio 2: ${n2Label} (n₂ = ${this.n2.toFixed(2)})`, this.width / 2, this.height - 14)

    ctx.restore()
  }

  getPresetLabel(n) {
    const normalized = Math.round(n * 100) / 100
    for (const key of Object.keys(this.presets)) {
      if (Math.abs(parseFloat(key) - normalized) < 0.01) {
        return this.presets[key].label
      }
    }
    return `n = ${n.toFixed(2)}`
  }

  drawBoundary(ctx) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, this.boundaryY)
    ctx.lineTo(this.width, this.boundaryY)
    ctx.stroke()

    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.font = '10px Inter, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText('interfase', this.width - 8, this.boundaryY - 4)
    ctx.restore()
  }

  drawNormal(ctx) {
    ctx.save()
    const nx = this.intersectX
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 5])

    ctx.beginPath()
    ctx.moveTo(nx, this.boundaryY - 180)
    ctx.lineTo(nx, this.boundaryY + 180)
    ctx.stroke()

    ctx.setLineDash([])

    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.font = '10px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Normal', nx, this.boundaryY - 186)

    ctx.restore()
  }

  drawIncidentRay(ctx) {
    const theta1Rad = this.degToRad(this.theta1)
    const nx = this.intersectX
    const ny = this.boundaryY

    const endX = nx - this.rayLength * Math.sin(theta1Rad)
    const endY = ny - this.rayLength * Math.cos(theta1Rad)

    ctx.save()
    ctx.strokeStyle = '#ef5350'
    ctx.lineWidth = 2.5
    ctx.globalAlpha = 0.9

    ctx.beginPath()
    ctx.moveTo(endX, endY)
    ctx.lineTo(nx, ny)
    ctx.stroke()

    ctx.fillStyle = '#ef5350'
    ctx.font = '11px Inter, sans-serif'
    ctx.textAlign = 'left'

    const midX = (endX + nx) / 2
    const midY = (endY + ny) / 2
    ctx.fillText('Rayo incidente', midX - 30, midY - 8)

    this.drawAngleArc(ctx, nx, ny, -Math.PI / 2, -Math.PI / 2 - theta1Rad, '#ef5350', `θ₁ = ${this.theta1}°`, 'left')

    ctx.restore()
  }

  drawRefractedRay(ctx) {
    if (this.isTIR) return
    if (this.theta2 <= 0.01) return

    const theta2Rad = this.degToRad(this.theta2)
    const nx = this.intersectX
    const ny = this.boundaryY

    const endX = nx + this.rayLength * Math.sin(theta2Rad)
    const endY = ny + this.rayLength * Math.cos(theta2Rad)

    ctx.save()
    ctx.strokeStyle = '#42a5f5'
    ctx.lineWidth = 2.5
    ctx.globalAlpha = 0.9

    ctx.beginPath()
    ctx.moveTo(nx, ny)
    ctx.lineTo(endX, endY)
    ctx.stroke()

    ctx.fillStyle = '#42a5f5'
    ctx.font = '11px Inter, sans-serif'
    ctx.textAlign = 'left'

    const midX = (endX + nx) / 2
    const midY = (endY + ny) / 2
    ctx.fillText('Rayo refractado', midX + 4, midY + 4)

    this.drawAngleArc(ctx, nx, ny, Math.PI / 2, Math.PI / 2 + theta2Rad, '#42a5f5', `θ₂ = ${this.theta2.toFixed(1)}°`, 'right')

    ctx.restore()
  }

  drawReflectedRay(ctx) {
    if (this.theta_r <= 0.01) return

    const thetaRRRad = this.degToRad(this.theta_r)
    const nx = this.intersectX
    const ny = this.boundaryY

    const endX = nx + this.rayLength * Math.sin(thetaRRRad)
    const endY = ny - this.rayLength * Math.cos(thetaRRRad)

    ctx.save()
    ctx.strokeStyle = '#ff9800'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.globalAlpha = 0.85

    ctx.beginPath()
    ctx.moveTo(nx, ny)
    ctx.lineTo(endX, endY)
    ctx.stroke()

    ctx.setLineDash([])

    ctx.fillStyle = '#ff9800'
    ctx.font = '10px Inter, sans-serif'
    ctx.textAlign = 'left'

    const midX = (endX + nx) / 2
    const midY = (endY + ny) / 2
    ctx.fillText('Rayo reflejado', midX + 4, midY - 4)

    ctx.restore()
  }

  drawAngleArc(ctx, cx, cy, startAngle, endAngle, color, label, side) {
    const radius = 40
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.globalAlpha = 0.7

    const start = Math.min(startAngle, endAngle)
    const end = Math.max(startAngle, endAngle)

    ctx.beginPath()
    ctx.arc(cx, cy, radius, start, end)
    ctx.stroke()

    const midAngle = (start + end) / 2
    const labelR = radius + 14
    const lx = cx + labelR * Math.cos(midAngle)
    const ly = cy + labelR * Math.sin(midAngle)

    ctx.fillStyle = color
    ctx.font = '10px Inter, sans-serif'
    ctx.globalAlpha = 0.85
    ctx.textAlign = side === 'left' ? 'right' : 'left'
    ctx.fillText(label, lx, ly + 3)

    ctx.restore()
  }

  drawTIRLabel(ctx) {
    if (!this.isTIR) return

    ctx.save()

    ctx.fillStyle = 'rgba(255, 152, 0, 0.15)'
    ctx.strokeStyle = '#ff9800'
    ctx.lineWidth = 1.5
    const bx = 40
    const by = this.boundaryY + 40
    const bw = 300
    const bh = 60
    ctx.roundRect(bx, by, bw, bh, 6)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#ff9800'
    ctx.font = 'bold 14px Inter, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('Reflexión Interna Total (TIR)', bx + 16, by + 24)

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.font = '11px Inter, sans-serif'
    ctx.fillText(`θ₁ = ${this.theta1}° > θc = ${this.criticalAngle.toFixed(1)}° → no hay refracción`, bx + 16, by + 46)

    ctx.restore()
  }

  drawInfoBox(ctx) {
    ctx.save()

    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.roundRect(this.width - 230, this.boundaryY + 16, 215, 100, 8)
    ctx.fill()

    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = '11px Inter, sans-serif'
    ctx.textAlign = 'left'

    const infoLines = [
      `n₁ = ${this.n1.toFixed(2)}  |  n₂ = ${this.n2.toFixed(2)}`,
      `θ₁ = ${this.theta1}°  |  θ₂ = ${this.isTIR ? 'TIR' : this.theta2.toFixed(1) + '°'}`,
      `θ reflejado = ${this.theta_r}°`
    ]

    if (!this.isTIR) {
      infoLines.push(`n₁·sen(θ₁) = n₂·sen(θ₂) ✓`)
    }

    if (this.n1 > this.n2) {
      infoLines.push(`θc = ${this.criticalAngle.toFixed(1)}°`)
    }

    infoLines.forEach((text, i) => {
      ctx.fillText(text, this.width - 220, this.boundaryY + 36 + i * 20)
    })

    ctx.restore()
  }

  drawFormula(ctx) {
    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.font = '12px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('n₁ · sen(θ₁) = n₂ · sen(θ₂)', this.width / 2, this.boundaryY - 60)
    ctx.restore()
  }

  render(ctx) {
    ctx.clearRect(0, 0, this.width, this.height)

    this.drawGrid(ctx)
    this.drawMediaLabels(ctx)
    this.drawBoundary(ctx)
    this.drawNormal(ctx)
    this.drawFormula(ctx)
    this.drawIncidentRay(ctx)
    this.drawReflectedRay(ctx)
    this.drawRefractedRay(ctx)
    this.drawTIRLabel(ctx)
    this.drawInfoBox(ctx)
  }
}
