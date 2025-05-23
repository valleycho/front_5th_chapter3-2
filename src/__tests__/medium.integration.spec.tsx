import { ChakraProvider } from '@chakra-ui/react';
import { render, screen, within, act, waitFor } from '@testing-library/react';
import { UserEvent, userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ReactElement } from 'react';

import {
  setupMockHandlerCreation,
  setupMockHandlerDeletion,
  setupMockHandlerDeletionAllRepeatEvents,
  setupMockHandlerUpdating,
  setupMockHandlerUpdatingAllRepeatEvents,
} from '../__mocks__/handlersUtils';
import App from '../App';
import { server } from '../setupTests';
import { Event, EventForm } from '../types';

// ! Hard 여기 제공 안함
const setup = (element: ReactElement) => {
  const user = userEvent.setup();

  return { ...render(<ChakraProvider>{element}</ChakraProvider>), user }; // ? Med: 왜 ChakraProvider로 감싸는지 물어보자
};

// ! Hard 여기 제공 안함
const saveSchedule = async (
  user: UserEvent,
  form: Omit<EventForm, 'repeat' | 'notificationTime'> &
    Partial<Pick<Event, 'repeat' | 'notificationTime'>>
) => {
  const { title, date, startTime, endTime, location, description, category, repeat } = form;
  const repeatCheckbox = screen.getByLabelText('반복 설정') as HTMLInputElement;

  await user.click(screen.getAllByText('일정 추가')[0]);

  await user.type(screen.getByLabelText('제목'), title);
  await user.type(screen.getByLabelText('날짜'), date);
  await user.type(screen.getByLabelText('시작 시간'), startTime);
  await user.type(screen.getByLabelText('종료 시간'), endTime);
  await user.type(screen.getByLabelText('설명'), description);
  await user.type(screen.getByLabelText('위치'), location);
  await user.selectOptions(screen.getByLabelText('카테고리'), category);

  // 반복일정이 체크되어있는데 repeatType이 none인 경우 반복 일정 체크 해제
  if (repeatCheckbox.checked && repeat?.type === 'none') {
    await user.click(repeatCheckbox);
  }

  await user.click(screen.getByTestId('event-submit-button'));
};

describe('일정 CRUD 및 기본 기능', () => {
  it('입력한 새로운 일정 정보에 맞춰 모든 필드가 이벤트 리스트에 정확히 저장된다.', async () => {
    setupMockHandlerCreation();

    const { user } = setup(<App />);

    await saveSchedule(user, {
      title: '새 회의',
      date: '2025-10-15',
      startTime: '14:00',
      endTime: '15:00',
      description: '프로젝트 진행 상황 논의',
      location: '회의실 A',
      category: '업무',
      repeat: { type: 'none', interval: 0 },
    });

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('새 회의')).toBeInTheDocument();
    expect(eventList.getByText('2025-10-15')).toBeInTheDocument();
    expect(eventList.getByText('14:00 - 15:00')).toBeInTheDocument();
    expect(eventList.getByText('프로젝트 진행 상황 논의')).toBeInTheDocument();
    expect(eventList.getByText('회의실 A')).toBeInTheDocument();
    expect(eventList.getByText('카테고리: 업무')).toBeInTheDocument();
  });

  it('기존 일정의 세부 정보를 수정하고 변경사항이 정확히 반영된다', async () => {
    const { user } = setup(<App />);

    setupMockHandlerUpdating();

    await user.click(await screen.findByLabelText('Edit event'));

    await user.clear(screen.getByLabelText('제목'));
    await user.type(screen.getByLabelText('제목'), '수정된 회의');
    await user.clear(screen.getByLabelText('설명'));
    await user.type(screen.getByLabelText('설명'), '회의 내용 변경');

    await user.click(screen.getByTestId('event-submit-button'));

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('수정된 회의')).toBeInTheDocument();
    expect(eventList.getByText('회의 내용 변경')).toBeInTheDocument();
  });

  it('일정을 삭제하고 더 이상 조회되지 않는지 확인한다', async () => {
    setupMockHandlerDeletion();

    const { user } = setup(<App />);
    const eventList = within(screen.getByTestId('event-list'));
    expect(await eventList.findByText('삭제할 이벤트')).toBeInTheDocument();

    // 삭제 버튼 클릭
    const allDeleteButton = await screen.findAllByLabelText('Delete event');
    await user.click(allDeleteButton[0]);

    expect(eventList.queryByText('삭제할 이벤트')).not.toBeInTheDocument();
  });
});

describe('일정 뷰', () => {
  it('주별 뷰를 선택 후 해당 주에 일정이 없으면, 일정이 표시되지 않는다.', async () => {
    // ! 현재 시스템 시간 2025-10-01
    const { user } = setup(<App />);

    await user.selectOptions(screen.getByLabelText('view'), 'week');

    // ! 일정 로딩 완료 후 테스트
    await screen.findByText('일정 로딩 완료!');

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('검색 결과가 없습니다.')).toBeInTheDocument();
  });

  it('주별 뷰 선택 후 해당 일자에 일정이 존재한다면 해당 일정이 정확히 표시된다', async () => {
    setupMockHandlerCreation();

    const { user } = setup(<App />);
    await saveSchedule(user, {
      title: '이번주 팀 회의',
      date: '2025-10-02',
      startTime: '09:00',
      endTime: '10:00',
      description: '이번주 팀 회의입니다.',
      location: '회의실 A',
      category: '업무',
      repeat: { type: 'none', interval: 0 },
    });

    await user.selectOptions(screen.getByLabelText('view'), 'week');

    const weekView = within(screen.getByTestId('week-view'));
    expect(weekView.getByText('이번주 팀 회의')).toBeInTheDocument();
  });

  it('월별 뷰에 일정이 없으면, 일정이 표시되지 않아야 한다.', async () => {
    vi.setSystemTime(new Date('2025-01-01'));

    setup(<App />);

    // ! 일정 로딩 완료 후 테스트
    await screen.findByText('일정 로딩 완료!');

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('검색 결과가 없습니다.')).toBeInTheDocument();
  });

  it('월별 뷰에 일정이 정확히 표시되는지 확인한다', async () => {
    setupMockHandlerCreation();

    const { user } = setup(<App />);
    await saveSchedule(user, {
      title: '이번달 팀 회의',
      date: '2025-10-02',
      startTime: '09:00',
      endTime: '10:00',
      description: '이번달 팀 회의입니다.',
      location: '회의실 A',
      category: '업무',
      repeat: { type: 'none', interval: 0 },
    });

    const monthView = within(screen.getByTestId('month-view'));
    expect(monthView.getByText('이번달 팀 회의')).toBeInTheDocument();
  });

  it('달력에 1월 1일(신정)이 공휴일로 표시되는지 확인한다', async () => {
    vi.setSystemTime(new Date('2025-01-01'));
    setup(<App />);

    const monthView = screen.getByTestId('month-view');

    // 1월 1일 셀 확인
    const januaryFirstCell = within(monthView).getByText('1').closest('td')!;
    expect(within(januaryFirstCell).getByText('신정')).toBeInTheDocument();
  });
});

describe('검색 기능', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/events', () => {
        return HttpResponse.json({
          events: [
            {
              id: 1,
              title: '팀 회의',
              date: '2025-10-15',
              startTime: '09:00',
              endTime: '10:00',
              description: '주간 팀 미팅',
              location: '회의실 A',
              category: '업무',
              repeat: { type: 'none', interval: 0 },
              notificationTime: 10,
            },
            {
              id: 2,
              title: '프로젝트 계획',
              date: '2025-10-16',
              startTime: '14:00',
              endTime: '15:00',
              description: '새 프로젝트 계획 수립',
              location: '회의실 B',
              category: '업무',
              repeat: { type: 'none', interval: 0 },
              notificationTime: 10,
            },
          ],
        });
      })
    );
  });

  afterEach(() => {
    server.resetHandlers();
  });

  it('검색 결과가 없으면, "검색 결과가 없습니다."가 표시되어야 한다.', async () => {
    const { user } = setup(<App />);

    const searchInput = screen.getByPlaceholderText('검색어를 입력하세요');
    await user.type(searchInput, '존재하지 않는 일정');

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('검색 결과가 없습니다.')).toBeInTheDocument();
  });

  it("'팀 회의'를 검색하면 해당 제목을 가진 일정이 리스트에 노출된다", async () => {
    const { user } = setup(<App />);

    const searchInput = screen.getByPlaceholderText('검색어를 입력하세요');
    await user.type(searchInput, '팀 회의');

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('팀 회의')).toBeInTheDocument();
  });

  it('검색어를 지우면 모든 일정이 다시 표시되어야 한다', async () => {
    const { user } = setup(<App />);

    const searchInput = screen.getByPlaceholderText('검색어를 입력하세요');
    await user.type(searchInput, '팀 회의');
    await user.clear(searchInput);

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('팀 회의')).toBeInTheDocument();
    expect(eventList.getByText('프로젝트 계획')).toBeInTheDocument();
  });
});

describe('일정 충돌', () => {
  afterEach(() => {
    server.resetHandlers();
  });

  it('겹치는 시간에 새 일정을 추가할 때 경고가 표시된다', async () => {
    setupMockHandlerCreation([
      {
        id: '1',
        title: '기존 회의',
        date: '2025-10-15',
        startTime: '09:00',
        endTime: '10:00',
        description: '기존 팀 미팅',
        location: '회의실 B',
        category: '업무',
        repeat: { type: 'none', interval: 0 },
        notificationTime: 10,
      },
    ]);

    const { user } = setup(<App />);

    await saveSchedule(user, {
      title: '새 회의',
      date: '2025-10-15',
      startTime: '09:30',
      endTime: '10:30',
      description: '설명',
      location: '회의실 A',
      category: '업무',
    });

    expect(screen.getByText('일정 겹침 경고')).toBeInTheDocument();
    expect(screen.getByText(/다음 일정과 겹칩니다/)).toBeInTheDocument();
    expect(screen.getByText('기존 회의 (2025-10-15 09:00-10:00)')).toBeInTheDocument();
  });

  it('기존 일정의 시간을 수정하여 충돌이 발생하면 경고가 노출된다', async () => {
    setupMockHandlerUpdating();

    const { user } = setup(<App />);

    const editButton = (await screen.findAllByLabelText('Edit event'))[1];
    await user.click(editButton);

    // 시간 수정하여 다른 일정과 충돌 발생
    await user.clear(screen.getByLabelText('시작 시간'));
    await user.type(screen.getByLabelText('시작 시간'), '08:30');
    await user.clear(screen.getByLabelText('종료 시간'));
    await user.type(screen.getByLabelText('종료 시간'), '10:30');

    await user.click(screen.getByTestId('event-submit-button'));

    expect(screen.getByText('일정 겹침 경고')).toBeInTheDocument();
    expect(screen.getByText(/다음 일정과 겹칩니다/)).toBeInTheDocument();
    expect(screen.getByText('기존 회의 (2025-10-15 09:00-10:00)')).toBeInTheDocument();
  });
});

it('notificationTime을 10으로 하면 지정 시간 10분 전 알람 텍스트가 노출된다', async () => {
  vi.setSystemTime(new Date('2025-10-15 08:49:59'));

  setup(<App />);

  // ! 일정 로딩 완료 후 테스트
  await screen.findByText('일정 로딩 완료!');

  expect(screen.queryByText('10분 후 기존 회의 일정이 시작됩니다.')).not.toBeInTheDocument();

  act(() => {
    vi.advanceTimersByTime(1000);
  });

  expect(screen.getByText('10분 후 기존 회의 일정이 시작됩니다.')).toBeInTheDocument();
});

describe('반복 일정 표시', () => {
  it('반복 일정이 있으면 반복 일정 표시 태그가 노출된다', async () => {
    setupMockHandlerCreation([
      {
        id: '1',
        title: '기존 회의',
        date: '2025-10-15',
        startTime: '09:00',
        endTime: '10:00',
        description: '기존 팀 미팅',
        location: '회의실 B',
        category: '업무',
        repeat: { type: 'daily', interval: 0 },
        notificationTime: 10,
      },
    ]);

    setup(<App />);

    const eventList = await screen.findByTestId('event-list');
    const repeatIcon = await screen.findByTestId('repeat-icon');

    expect(eventList).toHaveTextContent('기존 회의');
    expect(eventList).toHaveTextContent('반복일정');
    expect(repeatIcon).toBeInTheDocument();
  });

  it('반복 일정이 없으면 반복 일정 표시 태그가 노출되지 않는다', async () => {
    setupMockHandlerCreation([
      {
        id: '1',
        title: '기존 회의',
        date: '2025-10-15',
        startTime: '09:00',
        endTime: '10:00',
        description: '기존 팀 미팅',
        location: '회의실 B',
        category: '업무',
        repeat: { type: 'none', interval: 0 },
        notificationTime: 10,
      },
    ]);

    setup(<App />);

    const eventList = await screen.findByTestId('event-list');
    const repeatIcon = await screen.queryByTestId('repeat-icon');

    expect(eventList).toHaveTextContent('기존 회의');
    expect(repeatIcon).not.toBeInTheDocument();
  });
});

describe('반복 일정 단일 삭제', () => {
  it('반복 일정을 단일 삭제하면 해당 일정만 삭제된다', async () => {
    setupMockHandlerCreation([
      {
        id: '1',
        title: '기존 회의',
        date: '2025-10-20',
        startTime: '09:00',
        endTime: '10:00',
        description: '기존 팀 미팅',
        location: '회의실 B',
        category: '업무',
        repeat: { type: 'weekly', interval: 1 },
        repeatEnd: {
          type: 'endDate',
          endDate: '2025-10-30',
        },
        notificationTime: 10,
      },
      {
        id: '2',
        title: '기존 회의',
        date: '2025-10-27',
        startTime: '09:00',
        endTime: '10:00',
        description: '기존 팀 미팅',
        location: '회의실 B',
        category: '업무',
        repeat: { type: 'weekly', interval: 1 },
        repeatEnd: {
          type: 'endDate',
          endDate: '2025-10-30',
        },
        notificationTime: 10,
      },
    ]);

    const { user } = setup(<App />);

    await screen.findByText('일정 로딩 완료!');

    const deleteButtons = await screen.findAllByLabelText('Delete event');

    await act(async () => {
      await user.click(deleteButtons[1]);
    });

    await waitFor(() => {
      expect(screen.getAllByLabelText('Delete event')).toHaveLength(1);
    });
  });
});

describe('반복 일정 단일 수정', () => {
  it('반복 일정 중 한개를 수정하면 단일 일정으로 변경됩니다.', async () => {
    setupMockHandlerCreation([
      {
        id: '1',
        title: '기존 회의',
        date: '2025-10-20',
        startTime: '09:00',
        endTime: '10:00',
        description: '기존 팀 미팅',
        location: '회의실 B',
        category: '업무',
        repeat: { type: 'weekly', interval: 1 },
        repeatEnd: {
          type: 'endDate',
          endDate: '2025-10-30',
        },
        notificationTime: 10,
      },
      {
        id: '2',
        title: '기존 회의',
        date: '2025-10-27',
        startTime: '09:00',
        endTime: '10:00',
        description: '기존 팀 미팅',
        location: '회의실 B',
        category: '업무',
        repeat: { type: 'weekly', interval: 1 },
        repeatEnd: {
          type: 'endDate',
          endDate: '2025-10-30',
        },
        notificationTime: 10,
      },
    ]);

    const { user } = setup(<App />);

    await screen.findByText('일정 로딩 완료!');

    const editButtons = await screen.findAllByLabelText('Edit event');
    await user.click(editButtons[1]);

    await user.clear(screen.getByLabelText('제목'));
    await user.type(screen.getByLabelText('제목'), '수정된 회의');

    await user.click(screen.getByTestId('event-submit-button'));

    await screen.findByText('일정이 수정되었습니다.');

    const eventList = screen.getByTestId('event-list');
    const eventBoxes = within(eventList)
      .getAllByRole('generic')
      .filter(
        (box) => box.textContent?.includes('수정된 회의') || box.textContent?.includes('기존 회의')
      );

    const modifiedEventBox = eventBoxes.find((box) => box.textContent?.includes('수정된 회의'));
    expect(modifiedEventBox).toBeTruthy();
    expect(modifiedEventBox).not.toHaveTextContent('반복:');
  });

  it('반복 일정 중 한개를 수정하면 단일 일정으로 변경되고 반복일정 태그도 사라진다', async () => {
    setupMockHandlerCreation([
      {
        id: '1',
        title: '기존 회의',
        date: '2025-10-20',
        startTime: '09:00',
        endTime: '10:00',
        description: '기존 팀 미팅',
        location: '회의실 B',
        category: '업무',
        repeat: { type: 'weekly', interval: 1 },
        repeatEnd: {
          type: 'endDate',
          endDate: '2025-10-30',
        },
        notificationTime: 10,
      },
      {
        id: '2',
        title: '기존 회의',
        date: '2025-10-27',
        startTime: '09:00',
        endTime: '10:00',
        description: '기존 팀 미팅',
        location: '회의실 B',
        category: '업무',
        repeat: { type: 'weekly', interval: 1 },
        repeatEnd: {
          type: 'endDate',
          endDate: '2025-10-30',
        },
        notificationTime: 10,
      },
    ]);

    const { user } = setup(<App />);

    await screen.findByText('일정 로딩 완료!');

    const editButtons = await screen.findAllByLabelText('Edit event');
    await user.click(editButtons[1]);

    await user.clear(screen.getByLabelText('제목'));
    await user.type(screen.getByLabelText('제목'), '수정된 회의');

    await user.click(screen.getByTestId('event-submit-button'));

    await screen.findByText('일정이 수정되었습니다.');

    const eventList = screen.getByTestId('event-list');
    const eventBoxes = within(eventList)
      .getAllByRole('generic')
      .filter(
        (box) => box.textContent?.includes('수정된 회의') || box.textContent?.includes('기존 회의')
      );

    const modifiedEventBox = eventBoxes.find((box) => box.textContent?.includes('수정된 회의'));
    expect(
      within(modifiedEventBox as HTMLElement).queryByTestId('repeat-icon')
    ).not.toBeInTheDocument();
  });
});

describe('반복 종료', () => {
  it('종료일 선택하면 날짜 입력 필드가 표시된다', async () => {
    const { user } = setup(<App />);

    const select = screen.getByRole('combobox', { name: '반복 종료' });

    await user.selectOptions(select, 'endDate');

    const dateInput = screen.getByTestId('repeat-end-date');
    const countInput = screen.queryByTestId('repeat-end-count');

    expect(dateInput).toBeInTheDocument();
    expect(dateInput).toHaveAttribute('type', 'date');

    expect(countInput).not.toBeInTheDocument();
  });

  it('종료 횟수 선택하면 횟수 입력 필드가 표시된다', async () => {
    const { user } = setup(<App />);

    const select = screen.getByRole('combobox', { name: '반복 종료' });

    await user.selectOptions(select, 'endCount');

    const dateInput = screen.queryByTestId('repeat-end-date');
    const countInput = screen.getByTestId('repeat-end-count');

    expect(dateInput).not.toBeInTheDocument();

    expect(countInput).toBeInTheDocument();
    expect(countInput).toHaveAttribute('type', 'number');
  });
});

describe('반복 일정 전체 수정 및 삭제', () => {
  it('반복 일정의 전체 삭제시 반복 일정이 모두 삭제된다', async () => {
    setupMockHandlerDeletionAllRepeatEvents();

    const { user } = setup(<App />);

    await screen.findByText('일정 로딩 완료!');

    const repeatAllDeleteButtons = await screen.findAllByLabelText('Repeat All Delete');

    await act(async () => {
      await user.click(repeatAllDeleteButtons[1]);
    });

    const eventList = await screen.findByTestId('event-list');

    await waitFor(() => {
      expect(eventList).toHaveTextContent(/결과가 없습니다/i);
    });
  });

  it('반복 일정의 전체 수정시 반복 일정이 모두 수정된다', async () => {
    setupMockHandlerUpdatingAllRepeatEvents();

    const { user } = setup(<App />);

    await screen.findByText('일정 로딩 완료!');

    const editButtons = await screen.findAllByLabelText('Edit event');

    await act(async () => {
      await user.click(editButtons[1]);
    });

    await user.clear(screen.getByLabelText('제목'));
    await user.type(screen.getByLabelText('제목'), '수정된 회의');

    const repeatAllEditButton = await screen.findByTestId('repeat-all-edit-button');

    await act(async () => {
      await user.click(repeatAllEditButton);
    });

    await screen.findByText('반복 일정 모두 수정 완료');

    const eventList = await screen.findByTestId('event-list');

    const modifiedEvents = within(eventList).getAllByText('수정된 회의');

    expect(modifiedEvents).toHaveLength(2);
  });
});
