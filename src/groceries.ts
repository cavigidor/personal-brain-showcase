export const GROCERY_TITLE_LIMIT = 200;
export const GROCERY_STORE_LIMIT = 100;

export const groceryKey = (title: string) =>
  title.trim().replace(/\s+/g, " ").toLocaleLowerCase();
