/**
 * DOM操作バッチ処理ユーティリティ
 * 
 * 【責任範囲】
 * - DOM操作のバッチ化によるリフロー/リペイント最小化
 * - requestAnimationFrame による最適なタイミング制御
 * - メモリ効率的な操作キューイング
 * - パフォーマンス測定とボトルネック検出
 */

import { logger } from './AILogger.js';

export interface DOMOperation {
  id: string;
  element: HTMLElement;
  operation: 'style' | 'class' | 'text' | 'html' | 'attribute' | 'remove';
  property?: string;
  value?: any;
  priority: 'high' | 'normal' | 'low';
}

export interface BatchMetrics {
  operationsCount: number;
  executionTime: number;
  reflows: number;
  repaints: number;
}

export class DOMBatcher {
  private static instance: DOMBatcher;
  private operationQueue: DOMOperation[] = [];
  private isProcessing: boolean = false;
  private frameId: number | null = null;
  private batchStartTime: number = 0;

  private constructor() {}

  static getInstance(): DOMBatcher {
    if (!DOMBatcher.instance) {
      DOMBatcher.instance = new DOMBatcher();
    }
    return DOMBatcher.instance;
  }

  /**
   * DOM操作をキューに追加
   */
  queue(operation: Omit<DOMOperation, 'id'>): string {
    const id = this.generateOperationId();
    const fullOperation: DOMOperation = {
      id,
      ...operation
    };

    // 優先度によるソート挿入
    const insertIndex = this.findInsertPosition(fullOperation.priority);
    this.operationQueue.splice(insertIndex, 0, fullOperation);

    logger.debug({
      component: 'DOMBatcher',
      method: 'queue',
      operation: 'OPERATION_QUEUED',
      data: { 
        operationId: id, 
        operation: operation.operation,
        priority: operation.priority,
        queueLength: this.operationQueue.length 
      }
    }, `📋 DOM_OPERATION_QUEUED: ${operation.operation} (${operation.priority})`, ['dom', 'queue', 'performance']);

    this.scheduleProcessing();
    return id;
  }

  /**
   * スタイル変更をバッチ追加
   */
  setStyle(element: HTMLElement, property: string, value: string, priority: 'high' | 'normal' | 'low' = 'normal'): string {
    return this.queue({
      element,
      operation: 'style',
      property,
      value,
      priority
    });
  }

  /**
   * クラス変更をバッチ追加
   */
  toggleClass(element: HTMLElement, className: string, add: boolean, priority: 'high' | 'normal' | 'low' = 'normal'): string {
    return this.queue({
      element,
      operation: 'class',
      property: className,
      value: add,
      priority
    });
  }

  /**
   * テキスト変更をバッチ追加
   */
  setText(element: HTMLElement, text: string, priority: 'high' | 'normal' | 'low' = 'normal'): string {
    return this.queue({
      element,
      operation: 'text',
      value: text,
      priority
    });
  }

  /**
   * HTML変更をバッチ追加
   */
  setHTML(element: HTMLElement, html: string, priority: 'high' | 'normal' | 'low' = 'normal'): string {
    return this.queue({
      element,
      operation: 'html',
      value: html,
      priority
    });
  }

  /**
   * 属性変更をバッチ追加
   */
  setAttribute(element: HTMLElement, attribute: string, value: string, priority: 'high' | 'normal' | 'low' = 'normal'): string {
    return this.queue({
      element,
      operation: 'attribute',
      property: attribute,
      value,
      priority
    });
  }

  /**
   * 要素削除をバッチ追加
   */
  removeElement(element: HTMLElement, priority: 'high' | 'normal' | 'low' = 'normal'): string {
    return this.queue({
      element,
      operation: 'remove',
      priority
    });
  }

  /**
   * 即座に全操作を実行（緊急時用）
   */
  flush(): BatchMetrics {
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    return this.processBatch();
  }

  /**
   * 特定操作をキャンセル
   */
  cancel(operationId: string): boolean {
    const index = this.operationQueue.findIndex(op => op.id === operationId);
    if (index > -1) {
      this.operationQueue.splice(index, 1);
      logger.debug({
        component: 'DOMBatcher',
        method: 'cancel',
        operation: 'OPERATION_CANCELLED',
        data: { operationId, remainingQueue: this.operationQueue.length }
      }, `❌ DOM_OPERATION_CANCELLED: ${operationId}`, ['dom', 'cancel']);
      return true;
    }
    return false;
  }

  /**
   * キューをクリア
   */
  clear(): void {
    const cancelledCount = this.operationQueue.length;
    this.operationQueue = [];
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }

    logger.info({
      component: 'DOMBatcher',
      method: 'clear',
      operation: 'QUEUE_CLEARED',
      data: { cancelledOperations: cancelledCount }
    }, `🗑️ DOM_QUEUE_CLEARED: ${cancelledCount} operations cancelled`, ['dom', 'clear']);
  }

  private scheduleProcessing(): void {
    if (this.isProcessing || this.frameId !== null) {
      return;
    }

    this.frameId = requestAnimationFrame(() => {
      this.frameId = null;
      this.processBatch();
    });
  }

  private processBatch(): BatchMetrics {
    if (this.operationQueue.length === 0) {
      return { operationsCount: 0, executionTime: 0, reflows: 0, repaints: 0 };
    }

    this.isProcessing = true;
    this.batchStartTime = performance.now();
    const operationsCount = this.operationQueue.length;

    logger.debug({
      component: 'DOMBatcher',
      method: 'processBatch',
      operation: 'BATCH_START',
      data: { operationsCount }
    }, `🚀 DOM_BATCH_START: Processing ${operationsCount} operations`, ['dom', 'batch', 'performance']);

    // DocumentFragment を使用してDOM操作を最適化
    const elementsToProcess = new Map<HTMLElement, DOMOperation[]>();
    
    // 要素ごとに操作をグループ化
    this.operationQueue.forEach(operation => {
      if (!elementsToProcess.has(operation.element)) {
        elementsToProcess.set(operation.element, []);
      }
      elementsToProcess.get(operation.element)!.push(operation);
    });

    // バッチ実行
    let reflows = 0;
    let repaints = 0;

    elementsToProcess.forEach((operations, element) => {
      this.executeElementOperations(element, operations);
      reflows += this.estimateReflows(operations);
      repaints += this.estimateRepaints(operations);
    });

    const executionTime = performance.now() - this.batchStartTime;
    this.operationQueue = [];
    this.isProcessing = false;

    const metrics: BatchMetrics = {
      operationsCount,
      executionTime,
      reflows,
      repaints
    };

    logger.performance('DOMBatcher', 'BATCH_EXECUTION', executionTime, {
      operationsCount,
      reflows,
      repaints,
      avgTimePerOperation: executionTime / operationsCount
    });

    return metrics;
  }

  private executeElementOperations(element: HTMLElement, operations: DOMOperation[]): void {
    // 同一要素への操作を最適化順序で実行
    const sortedOps = operations.sort((a, b) => {
      const order = { style: 1, attribute: 2, class: 3, text: 4, html: 5, remove: 6 };
      return order[a.operation] - order[b.operation];
    });

    for (const operation of sortedOps) {
      try {
        this.executeSingleOperation(operation);
      } catch (error) {
        logger.error({
          component: 'DOMBatcher',
          method: 'executeElementOperations',
          operation: 'OPERATION_FAILED',
          error: error as Error,
          data: { 
            operationId: operation.id,
            operationType: operation.operation 
          }
        }, `❌ DOM_OPERATION_FAILED: ${operation.operation}`, ['dom', 'error', 'operation']);
      }
    }
  }

  private executeSingleOperation(operation: DOMOperation): void {
    switch (operation.operation) {
      case 'style':
        if (operation.property && operation.value !== undefined) {
          (operation.element.style as any)[operation.property] = operation.value;
        }
        break;
      case 'class':
        if (operation.property) {
          if (operation.value) {
            operation.element.classList.add(operation.property);
          } else {
            operation.element.classList.remove(operation.property);
          }
        }
        break;
      case 'text':
        operation.element.textContent = String(operation.value || '');
        break;
      case 'html':
        operation.element.innerHTML = String(operation.value || '');
        break;
      case 'attribute':
        if (operation.property) {
          operation.element.setAttribute(operation.property, String(operation.value || ''));
        }
        break;
      case 'remove':
        operation.element.remove();
        break;
    }
  }

  private findInsertPosition(priority: 'high' | 'normal' | 'low'): number {
    const priorityValues = { high: 3, normal: 2, low: 1 };
    const targetPriority = priorityValues[priority];

    for (let i = 0; i < this.operationQueue.length; i++) {
      const currentPriority = priorityValues[this.operationQueue[i].priority];
      if (currentPriority < targetPriority) {
        return i;
      }
    }
    return this.operationQueue.length;
  }

  private estimateReflows(operations: DOMOperation[]): number {
    // レイアウトに影響する操作をカウント
    return operations.filter(op => 
      op.operation === 'style' && 
      this.isLayoutProperty(op.property || '') ||
      op.operation === 'html' ||
      op.operation === 'remove'
    ).length;
  }

  private estimateRepaints(operations: DOMOperation[]): number {
    // 再描画に影響する操作をカウント
    return operations.filter(op => 
      op.operation === 'style' ||
      op.operation === 'class' ||
      op.operation === 'text' ||
      op.operation === 'html'
    ).length;
  }

  private isLayoutProperty(property: string): boolean {
    const layoutProperties = [
      'width', 'height', 'padding', 'margin', 'border',
      'position', 'top', 'left', 'right', 'bottom',
      'display', 'float', 'clear', 'overflow'
    ];
    return layoutProperties.some(prop => property.toLowerCase().includes(prop));
  }

  private generateOperationId(): string {
    return `dom_op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// シングルトンインスタンス
export const domBatcher = DOMBatcher.getInstance();