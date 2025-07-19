/**
 * テスト実行エントリーポイント
 */

import { TestRunner } from './TestRunner.js';
import { BookDataModelTestSuite } from './BookDataModel.test.js';
import { StorageServiceTestSuite } from './StorageService.test.js';
import { MemoryManagerTestSuite } from './MemoryManager.test.js';
import { DOMBatcherTestSuite } from './DOMBatcher.test.js';
import { logger } from '../utils/AILogger.js';

async function runAllTests(): Promise<void> {
  logger.info({
    component: 'TestRunner',
    method: 'runAllTests',
    operation: 'TEST_SUITE_START'
  }, '🧪 TEST_SUITE_START: Starting all unit tests', ['test', 'suite', 'start']);

  const runner = new TestRunner();
  
  // テストスイートを追加
  runner.addSuite(BookDataModelTestSuite);
  runner.addSuite(StorageServiceTestSuite);
  runner.addSuite(MemoryManagerTestSuite);
  runner.addSuite(DOMBatcherTestSuite);
  
  try {
    // 全テスト実行
    const results = await runner.runAll();
    
    // 結果をコンソールに出力
    runner.printReport();
    
    // 結果をAIロガーに記録
    const summary = results.reduce((acc, suite) => {
      acc.totalTests += suite.tests.length;
      acc.totalPassed += suite.passed;
      acc.totalFailed += suite.failed;
      acc.totalSkipped += suite.skipped;
      return acc;
    }, { totalTests: 0, totalPassed: 0, totalFailed: 0, totalSkipped: 0 });
    
    const allPassed = summary.totalFailed === 0;
    
    logger.info({
      component: 'TestRunner',
      method: 'runAllTests',
      operation: 'TEST_SUITE_COMPLETE',
      data: {
        ...summary,
        successRate: (summary.totalPassed / summary.totalTests * 100).toFixed(2) + '%',
        allPassed
      }
    }, `🏁 TEST_SUITE_COMPLETE: ${summary.totalPassed}/${summary.totalTests} passed`, ['test', 'suite', 'complete']);
    
    if (!allPassed) {
      logger.error({
        component: 'TestRunner',
        method: 'runAllTests',
        operation: 'TEST_FAILURES_DETECTED',
        data: { failedTests: summary.totalFailed }
      }, `❌ TEST_FAILURES_DETECTED: ${summary.totalFailed} tests failed`, ['test', 'failure']);
    }
    
  } catch (error) {
    logger.fatal({
      component: 'TestRunner',
      method: 'runAllTests',
      operation: 'TEST_SUITE_CRASH',
      error: error as Error
    }, '💥 TEST_SUITE_CRASH: Test suite crashed unexpectedly', ['test', 'crash', 'fatal']);
    
    console.error('Test suite crashed:', error);
  }
}

// 自動実行（開発環境）
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  // ページ読み込み後にテスト実行
  window.addEventListener('load', () => {
    console.log('🧪 Running unit tests in development mode...');
    runAllTests();
  });
}

// モジュールとしてエクスポート
export { runAllTests };