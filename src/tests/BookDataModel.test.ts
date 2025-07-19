/**
 * BookDataModel テスト
 */

import { BookDataModel } from '../models/BookData.js';
import { TestSuite, assert, assertEqual, assertNotEqual } from './TestRunner.js';

export const BookDataModelTestSuite: TestSuite = {
  name: 'BookDataModel',
  tests: [
    {
      name: 'should initialize with default values',
      fn: () => {
        const model = new BookDataModel();
        const data = model.getData();
        
        assertEqual(data.bookTitle, '');
        assertEqual(data.bookAuthor, '');
        assertEqual(data.currentReviews, 0);
        assertEqual(data.targetReviews, 0);
        assertEqual(data.stretchReviews, 0);
        assertEqual(data.bookUrl, '');
        assertEqual(data.bookCoverUrl, '');
      }
    },
    
    {
      name: 'should initialize with provided data',
      fn: () => {
        const initialData = {
          bookTitle: 'Test Book',
          bookAuthor: 'Test Author',
          currentReviews: 50,
          targetReviews: 100,
          stretchReviews: 200,
          bookUrl: 'https://example.com/book',
          bookCoverUrl: 'https://example.com/cover.jpg',
          lastUpdated: '2024-01-01T00:00:00.000Z'
        };
        
        const model = new BookDataModel(initialData);
        const data = model.getData();
        
        assertEqual(data.bookTitle, 'Test Book');
        assertEqual(data.bookAuthor, 'Test Author');
        assertEqual(data.currentReviews, 50);
        assertEqual(data.targetReviews, 100);
        assertEqual(data.stretchReviews, 200);
      }
    },
    
    {
      name: 'should calculate progress correctly',
      fn: () => {
        const model = new BookDataModel({
          currentReviews: 50,
          targetReviews: 100,
          stretchReviews: 200
        });
        
        const progress = model.calculateProgress();
        
        assertEqual(progress.achievementRate, 50);
        assertEqual(progress.progressPercentage, 50);
        assertEqual(progress.remainingReviews, 50);
        assertEqual(progress.isTargetAchieved, false);
        assertEqual(progress.isStretchAchieved, false);
      }
    },
    
    {
      name: 'should handle target achievement',
      fn: () => {
        const model = new BookDataModel({
          currentReviews: 100,
          targetReviews: 100,
          stretchReviews: 200
        });
        
        const progress = model.calculateProgress();
        
        assertEqual(progress.achievementRate, 100);
        assertEqual(progress.isTargetAchieved, true);
        assertEqual(progress.isStretchAchieved, false);
        assertEqual(progress.remainingReviews, 0);
      }
    },
    
    {
      name: 'should handle stretch achievement',
      fn: () => {
        const model = new BookDataModel({
          currentReviews: 250,
          targetReviews: 100,
          stretchReviews: 200
        });
        
        const progress = model.calculateProgress();
        
        assertEqual(progress.achievementRate, 250);
        assertEqual(progress.isTargetAchieved, true);
        assertEqual(progress.isStretchAchieved, true);
      }
    },
    
    {
      name: 'should update data correctly',
      fn: () => {
        const model = new BookDataModel();
        
        model.updateData({
          bookTitle: 'Updated Title',
          currentReviews: 75
        });
        
        const data = model.getData();
        assertEqual(data.bookTitle, 'Updated Title');
        assertEqual(data.currentReviews, 75);
        // Other fields should remain unchanged
        assertEqual(data.bookAuthor, '');
      }
    },
    
    {
      name: 'should validate data correctly',
      fn: () => {
        const model = new BookDataModel();
        
        // Valid data
        let result = model.validate({
          bookTitle: 'Valid Title',
          bookAuthor: 'Valid Author',
          currentReviews: 50,
          targetReviews: 100,
          stretchReviews: 200,
          bookUrl: 'https://www.amazon.co.jp/dp/1234567890'
        });
        assertEqual(result.isValid, true);
        assertEqual(result.errors.length, 0);
        
        // Invalid data - empty title
        result = model.validate({
          bookTitle: '',
          targetReviews: 100
        });
        assertEqual(result.isValid, false);
        assert(result.errors.length > 0);
        
        // Invalid data - negative reviews
        result = model.validate({
          bookTitle: 'Title',
          currentReviews: -5,
          targetReviews: 100
        });
        assertEqual(result.isValid, false);
        
        // Invalid data - stretch goal less than target
        result = model.validate({
          bookTitle: 'Title',
          targetReviews: 200,
          stretchReviews: 100
        });
        assertEqual(result.isValid, false);
      }
    },
    
    {
      name: 'should reset data correctly',
      fn: () => {
        const model = new BookDataModel({
          bookTitle: 'Title',
          currentReviews: 50,
          targetReviews: 100
        });
        
        model.reset();
        const data = model.getData();
        
        assertEqual(data.bookTitle, '');
        assertEqual(data.currentReviews, 0);
        assertEqual(data.targetReviews, 0);
      }
    },
    
    {
      name: 'should handle milestone calculation',
      fn: () => {
        const model = new BookDataModel({
          currentReviews: 150,
          targetReviews: 200,
          stretchReviews: 400
        });
        
        const milestones = model.getMilestones();
        
        assert(Array.isArray(milestones));
        assert(milestones.length > 0);
        
        // Check some milestones are achieved
        const achievedMilestones = milestones.filter(m => m.achieved);
        assert(achievedMilestones.length > 0);
      }
    }
  ]
};