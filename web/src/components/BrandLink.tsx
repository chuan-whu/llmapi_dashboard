import styles from './BrandLink.module.scss';

type BrandLinkProps = {
  className?: string;
};

export function BrandLink({ className = '' }: BrandLinkProps) {
  const brandClassName = `${styles.brandLink} ${className}`.trim();

  return <span className={brandClassName}>LLMAPI usage</span>;
}
