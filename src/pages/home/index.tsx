import React from 'react';
import TabBar from '@/components/TabBar';

import styles from './index.module.less';

export default function Home() {
  return (
    <div className={styles['home-container']}>
      <h2>组件演示路径</h2>
      <TabBar />
    </div>
  );
}
