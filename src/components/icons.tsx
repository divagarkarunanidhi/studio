
import Image from 'next/image';

export const Logo = (props: React.SVGProps<SVGSVGElement>) => (
    <Image src="/icon.png" alt="logo" width={117} height={26} {...props} />
  );
  

    