export type ProductCategory = "Open-front" | "Occasion" | "Kaftan" | "Everyday";

export interface Product {
  slug: string;
  name: string;
  arabicName: string;
  category: ProductCategory;
  colour: string;
  price: number;
  image: string;
  description: string;
  fabric: string;
  isNew: boolean;
}