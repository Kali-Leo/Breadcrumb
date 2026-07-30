/**
 * Purpose: chimney smoke — soft ink curls rising from village buildings on breathing
 * cycles, giving the map its pulse. Pure code animation over static sprites.
 * Main exports: startSmoke (returns a stop function).
 */
import gsap from "gsap";
import { type Container, Graphics, type Sprite } from "pixi.js";

export function startSmoke(
  layer: Container,
  villageSprites: ReadonlyMap<string, Sprite>,
): () => void {
  const timers: ReturnType<typeof setInterval>[] = [];
  let index = 0;
  for (const sprite of villageSprites.values()) {
    const phase = 1400 * index++;
    const timer = setInterval(() => {
      if (!sprite.parent || layer.destroyed) return;
      puff(layer, sprite);
    }, 4600);
    setTimeout(() => puff(layer, sprite), 600 + phase);
    timers.push(timer);
  }
  return () => {
    for (const timer of timers) clearInterval(timer);
  };
}

function puff(layer: Container, sprite: Sprite): void {
  const chimneyX = sprite.x + sprite.width * 0.16;
  const chimneyY = sprite.y - sprite.height * 0.42;
  for (let i = 0; i < 3; i++) {
    const circle = new Graphics()
      .circle(0, 0, 3 + i * 1.5)
      .stroke({ color: 0x222222, width: 1, alpha: 0.5 });
    circle.position.set(chimneyX, chimneyY);
    circle.alpha = 0;
    layer.addChild(circle);
    gsap
      .timeline({ delay: i * 0.35, onComplete: () => circle.destroy() })
      .to(circle, { alpha: 0.5, duration: 0.4 })
      .to(circle, {
        y: chimneyY - 26 - i * 8,
        x: chimneyX + Math.sin(i * 2.1) * 7,
        alpha: 0,
        duration: 2.4,
        ease: "power1.out",
      });
  }
}
