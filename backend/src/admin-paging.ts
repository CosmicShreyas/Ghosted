// Admin lists load page by page as the panel scrolls: ?offset=N, PAGE rows at a time. One extra row
// is fetched to know whether there's more; nextOffset is null on the last page.
import { z } from "zod";

export const PAGE = 30;
export const offsetQ = z.coerce.number().int().min(0).max(1_000_000).default(0);
export const paged = <T,>(rows: T[], offset: number) => ({ items: rows.slice(0, PAGE), nextOffset: rows.length > PAGE ? offset + PAGE : null });
