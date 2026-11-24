import type { Item } from "@prisma/client";

/** 将 Prisma Decimal 等转为可 JSON 序列化的普通对象 */
export function itemToPlain(item: Item) {
  return {
    ...item,
    price: item.price != null ? Number(item.price) : 0,
  };
}

export function itemsToPlain(items: Item[]) {
  return items.map(itemToPlain);
}
