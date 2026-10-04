export const TOPICS = ['cash', 'sales', 'costs', 'stock', 'growth'] as const;
export type Topic = typeof TOPICS[number];
export const TOPIC_NAMES: Record<Topic,string> = {cash:'Borç, alacak ve nakit',sales:'Satışlar ve kanal kapsamı',costs:'Maliyet ve kâr',stock:'Mevcut stok ve gelecek sipariş',growth:'Sermaye ve kârlı büyüme'};
