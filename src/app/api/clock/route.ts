import { getSimulationClock } from "@/lib/simulation-clock";
import { NextResponse } from "next/server";

/** GET /api/clock — Returns current clock state */
export async function GET() {
  const clock = getSimulationClock();
  return NextResponse.json(clock.getState());
}

/** POST /api/clock — Control the clock */
export async function POST(req: Request) {
  const clock = getSimulationClock();
  const body = await req.json();

  switch (body.action) {
    case "start":
      clock.start();
      break;
    case "pause":
      clock.pause();
      break;
    case "reset":
      clock.reset(body.startTime);
      break;
    case "setSpeed":
      if (typeof body.speed === "number") {
        clock.setSpeed(body.speed);
      }
      break;
    case "advance":
      if (typeof body.minutes === "number") {
        clock.advance(body.minutes);
      }
      break;
    case "jumpTo":
      if (typeof body.time === "string") {
        clock.jumpTo(body.time);
      }
      break;
    default:
      return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
  }

  return NextResponse.json(clock.getState());
}
