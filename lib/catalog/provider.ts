import type { Category, Product } from '@/lib/types';

export interface ProductQuery {
  category?: Category;
  text?: string;
}

export interface ProductProvider {
  all(): Promise<Product[]>;
  search(query: ProductQuery): Promise<Product[]>;
}
