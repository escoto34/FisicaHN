export class Vector2D {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    add(v) {
        return new Vector2D(this.x + v.x, this.y + v.y);
    }

    subtract(v) {
        return new Vector2D(this.x - v.x, this.y - v.y);
    }

    scale(s) {
        return new Vector2D(this.x * s, this.y * s);
    }

    dot(v) {
        return this.x * v.x + this.y * v.y;
    }

    cross(v) {
        return this.x * v.y - this.y * v.x;
    }

    magnitude() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    normalize() {
        const m = this.magnitude();
        return m === 0 ? new Vector2D() : new Vector2D(this.x / m, this.y / m);
    }

    angle() {
        return Math.atan2(this.y, this.x);
    }

    clone() {
        return new Vector2D(this.x, this.y);
    }

    static add(a, b) {
        return a.add(b);
    }

    static subtract(a, b) {
        return a.subtract(b);
    }

    static scale(v, s) {
        return v.scale(s);
    }

    static dot(a, b) {
        return a.dot(b);
    }

    static fromAngle(angle, magnitude = 1) {
        return new Vector2D(
            magnitude * Math.cos(angle),
            magnitude * Math.sin(angle)
        );
    }

    static distance(a, b) {
        return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    }

    static lerp(a, b, t) {
        return new Vector2D(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    }
}
