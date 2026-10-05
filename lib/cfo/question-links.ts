export const questionHref=(id:string)=>`/cfo/sorular?question=${encodeURIComponent(id)}#question-${encodeURIComponent(id)}`;
export function questionSourceHref(scope:string|null){
  return scope==='ITHALAT_SATIRI'?'/cfo/kazananlar#ithalat':scope==='KAZANAN_SATIRI'?'/cfo/kazananlar':null;
}
