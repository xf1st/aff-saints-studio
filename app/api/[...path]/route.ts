import { handle } from "@/lib/server";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: Request, ctx: Context) {
  return handle(request, (await ctx.params).path);
}
export async function POST(request: Request, ctx: Context) {
  return handle(request, (await ctx.params).path);
}
