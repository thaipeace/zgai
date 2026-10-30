import { NextResponse } from "next/server";
import { z } from "zod";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/** Bọc route handler: lỗi validate -> 400, lỗi khác -> 500 với thông điệp dễ hiểu. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return json({ error: "Dữ liệu không hợp lệ", details: err.issues }, 400);
      }
      console.error(err);
      return json({ error: err instanceof Error ? err.message : "Lỗi không xác định" }, 500);
    }
  };
}

export type IdParams = { params: Promise<{ id: string }> };

export const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD");

