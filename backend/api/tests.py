import os
import unittest

from django.test import TestCase

from .models import Driver, Vehicle, Ticket, PUVType


class ModelSopFieldsTests(TestCase):
    def test_required_sop_fields_exist(self):
        self.assertTrue(hasattr(Driver, 'iwp_number'))
        self.assertTrue(hasattr(Driver, 'first_name'))
        self.assertTrue(hasattr(Driver, 'middle_name'))
        self.assertTrue(hasattr(Driver, 'gender'))
        self.assertTrue(hasattr(Driver, 'birthdate'))
        self.assertTrue(hasattr(Driver, 'province'))
        self.assertTrue(hasattr(Driver, 'city'))
        self.assertTrue(hasattr(Driver, 'barangay'))
        self.assertTrue(hasattr(Driver, 'street'))
        self.assertTrue(hasattr(Driver, 'photo'))

        self.assertTrue(hasattr(Vehicle, 'transportation_id'))
        self.assertTrue(hasattr(Vehicle, 'franchise_number'))
        self.assertTrue(hasattr(Vehicle, 'operator_address'))
        self.assertTrue(hasattr(Vehicle, 'qr_code'))

        self.assertTrue(hasattr(Ticket, 'mode'))
        self.assertTrue(hasattr(Ticket, 'remittance_batch'))


class PaperIssuanceTests(TestCase):
    def setUp(self):
        from .models import Requisition, TicketForm, TicketSeries
        form = TicketForm.objects.create(name='Std', price=10)
        req = Requisition.objects.create()
        self.series = TicketSeries.objects.create(
            series_no='S1', ticket_form=form, start_no='1', end_no='1000', unit_value=0, requisition=req,
        )
        self.form = form

    def _paper(self, a, b):
        from .models import PaperIssuance
        from datetime import date
        return PaperIssuance.objects.create(series=self.series, from_no=a, to_no=b, used_on=date.today())

    def test_allocator_skips_paper_range_and_out_of_order_ranges(self):
        from .views.viewsets import _consume_series_fifo
        self._paper(1, 624)
        self._paper(700, 710)
        units = _consume_series_fifo(self.form.id, 3)
        self.assertEqual([u[1] for u in units], ['625', '626', '627'])

    def test_stock_and_amount_count_paper(self):
        from .serializers import TicketSeriesSerializer, PaperIssuanceSerializer
        p = self._paper(1, 624)
        self.assertEqual(p.amount, 6240)
        self.assertEqual(TicketSeriesSerializer(self.series).data['remaining'], 376)
        self.assertEqual(PaperIssuanceSerializer(p).data['count'], 624)

    def test_validation_rejects_overlap_and_out_of_series(self):
        from .serializers import PaperIssuanceSerializer
        from datetime import date
        self._paper(1, 624)
        base = {'series': self.series.id, 'used_on': date.today().isoformat(), 'reason': 'SYSTEM_DOWN'}
        for a, b in [(600, 650), (990, 1001), (5, 2)]:
            s = PaperIssuanceSerializer(data={**base, 'from_no': a, 'to_no': b})
            self.assertFalse(s.is_valid(), (a, b))
        self.assertTrue(PaperIssuanceSerializer(data={**base, 'from_no': 625, 'to_no': 630}).is_valid())

    def test_next_free_skips_paper_and_system_numbers(self):
        from rest_framework.test import APIRequestFactory, force_authenticate
        from .models import User
        from .views import PaperIssuanceViewSet
        self._paper(1, 624)
        user = User.objects.create_user(username='a', password='x', role='SUPERADMIN')
        req = APIRequestFactory().get('/paper-issuances/next-free/', {'series': self.series.id})
        force_authenticate(req, user=user)
        res = PaperIssuanceViewSet.as_view({'get': 'next_free'})(req)
        self.assertEqual(res.data['next_free'], 625)

    def test_last_used_no_covers_paper_and_system_tickets(self):
        from .serializers import TicketSeriesSerializer
        self.assertIsNone(TicketSeriesSerializer(self.series).data['last_used_no'])
        self._paper(1, 624)
        self.assertEqual(TicketSeriesSerializer(self.series).data['last_used_no'], 624)

    def test_paper_cash_is_reported_but_not_expected(self):
        from datetime import date
        from rest_framework.test import APIRequestFactory, force_authenticate
        from .models import User
        from .views.reports import eod_reconciliation
        user = User.objects.create_user(username='b', password='x', role='SUPERADMIN')
        self._paper(1, 494)  # 494 x 10 = 4,940, remitted at the treasury
        req = APIRequestFactory().get('/report/eod-reconciliation/', {'date': date.today().isoformat()})
        force_authenticate(req, user=user)
        data = eod_reconciliation(req).data
        self.assertEqual(data['paper_count'], 494)
        self.assertEqual(data['paper_amount'], 4940.0)
        self.assertEqual(data['expected_cash'], 0.0)
        self.assertEqual(data['difference'], 0.0)

    def _void(self):
        from rest_framework.test import APIClient
        from .models import User
        client = APIClient()
        client.force_authenticate(User.objects.create_user(username='v', password='x', role='SUPERADMIN'))
        return client.post(f'/api/ticket-series/{self.series.id}/void/')

    def test_void_frees_range_for_reentry(self):
        from .models import Requisition, TicketSeries
        self.assertEqual(self._void().status_code, 204)
        self.assertFalse(TicketSeries.objects.exists())
        self.assertFalse(Requisition.objects.exists())  # it held only this series
        again = TicketSeries.objects.create(
            series_no='S1', ticket_form=self.form, start_no='1', end_no='1000', unit_value=0,
            requisition=Requisition.objects.create(),
        )
        self.assertTrue(again.pk)

    def test_void_blocked_once_range_is_used(self):
        from .models import TicketSeries
        self._paper(1, 5)
        res = self._void()
        self.assertEqual(res.status_code, 400)
        self.assertTrue(TicketSeries.objects.filter(pk=self.series.pk).exists())


class ArchivableSettingsTests(TestCase):
    def setUp(self):
        from rest_framework.test import APIClient
        from .models import Route, User
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_user(username='c', password='x', role='SUPERADMIN'))
        self.route = Route.objects.create(origin='Bacnotan')
        self.puv = PUVType.objects.create(name='Jeepney')

    def test_in_use_cannot_be_deleted_but_can_be_archived_and_restored(self):
        Vehicle.objects.create(plate_number='ABC123', route=self.route, transportation_id=self.puv)
        for path in (f'/api/routes/{self.route.id}/', f'/api/puvtypes/{self.puv.id}/'):
            res = self.client.delete(path)
            self.assertEqual(res.status_code, 409, path)
            self.assertIn('Archive it instead', res.data['detail'])

        self.assertEqual(self.client.put(f'/api/routes/{self.route.id}/', {'origin': 'Bacnotan', 'is_archived': True}).status_code, 200)
        self.assertEqual(self.client.get('/api/routes/').data, [])
        archived = self.client.get('/api/routes/?is_archived=true').data
        self.assertEqual([(r['id'], r['vehicle_count']) for r in archived], [(self.route.id, 1)])
        self.client.put(f'/api/routes/{self.route.id}/', {'origin': 'Bacnotan', 'is_archived': False})
        self.assertEqual(len(self.client.get('/api/routes/').data), 1)

    def test_unused_can_be_deleted(self):
        self.assertEqual(self.client.delete(f'/api/routes/{self.route.id}/').status_code, 204)

    def test_queued_vehicle_cannot_be_archived(self):
        vehicle = Vehicle.objects.create(plate_number='ABC123', route=self.route, status='QUEUED')
        res = self.client.patch(f'/api/vehicles/{vehicle.id}/', {'is_archived': True})
        self.assertEqual(res.status_code, 400)
        vehicle.refresh_from_db()
        self.assertFalse(vehicle.is_archived)

        vehicle.status = 'AVAILABLE'
        vehicle.save()
        self.assertEqual(self.client.patch(f'/api/vehicles/{vehicle.id}/', {'is_archived': True}).status_code, 200)


class OfflineStaffRegistrationTests(TestCase):
    def setUp(self):
        from rest_framework.test import APIClient
        from .models import User
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_user(username='adm', password='x', role='SUPERADMIN'))
        self.payload = {'username': 'new@staff.ph', 'first_name': 'New', 'last_name': 'Staff', 'role': 'PERSONNEL'}

    def test_login_email_is_parked_while_mail_is_down_then_sent(self):
        from unittest import mock
        from django.test import override_settings
        from .models import PendingAccountEmail, User
        from .sync.account_emails import flush_account_emails

        with override_settings(DEBUG=True):
            with mock.patch('api.views.viewsets.send_new_account_email', side_effect=OSError('offline')):
                res = self.client.post('/api/users/', self.payload)
            self.assertEqual(res.status_code, 201)
            self.assertTrue(res.data['email_queued'])
            parked = PendingAccountEmail.objects.get()

            with mock.patch('api.views.viewsets.send_new_account_email') as send:
                self.assertEqual(flush_account_emails(), 1)
            send.assert_called_once()
            self.assertEqual(send.call_args.args[1], parked.temp_password)
            self.assertTrue(User.objects.get(username='new@staff.ph').check_password(parked.temp_password))
            self.assertFalse(PendingAccountEmail.objects.exists())

    def test_account_created_offline_is_parked_and_not_emailed_until_pushed(self):
        from unittest import mock
        from .models import LOCAL_ADMIN_PK_BASE, PendingAccountEmail, PendingSetting
        from .sync.account_emails import flush_account_emails

        with mock.patch('api.views.helpers.supabase_reachable', return_value=False):
            res = self.client.post('/api/users/', self.payload)
        self.assertEqual(res.status_code, 201)
        self.assertGreater(res.data['id'], LOCAL_ADMIN_PK_BASE)
        self.assertTrue(res.data['email_queued'])
        self.assertTrue(PendingSetting.objects.filter(model_label='api.User', obj_id=res.data['id']).exists())

        with mock.patch('api.views.helpers.supabase_reachable', return_value=True), \
                mock.patch('api.views.viewsets.send_new_account_email') as send:
            self.assertEqual(flush_account_emails(), 0)
        send.assert_not_called()
        self.assertTrue(PendingAccountEmail.objects.exists())


class OfflineSettingDeleteTests(TestCase):
    def test_delete_offline_is_parked_and_not_resurrected_by_pull_then_pushed(self):
        from unittest import mock
        from rest_framework.test import APIClient
        from .models import PendingSetting, TicketForm, User
        from .sync.settings_outbox import flush_settings, pending_settings

        client = APIClient()
        client.force_authenticate(User.objects.create_user(username='adm', password='x', role='SUPERADMIN'))
        form = TicketForm.objects.create(name='Cash', price=10)

        with mock.patch('api.views.helpers.supabase_reachable', return_value=False):
            res = client.delete(f'/api/ticket-forms/{form.pk}/')
        self.assertEqual(res.status_code, 204)
        self.assertFalse(TicketForm.objects.filter(pk=form.pk).exists())
        tombstone = PendingSetting.objects.get(model_label='api.TicketForm', obj_id=form.pk)
        self.assertTrue(tombstone.is_delete)
        self.assertIn(form.pk, pending_settings()['api.TicketForm'])  # pull_all skips it

        remote = mock.MagicMock()
        with mock.patch('api.views.helpers.supabase_reachable', return_value=True), \
                mock.patch.object(TicketForm.objects, 'using', return_value=remote):
            self.assertEqual(flush_settings(), 1)
        remote.filter.assert_called_once_with(pk=form.pk)
        remote.filter.return_value.delete.assert_called_once()
        self.assertFalse(PendingSetting.objects.exists())


class OfflineChangePasswordTests(TestCase):
    def test_password_change_works_offline_and_is_parked_for_push(self):
        from unittest import mock
        from rest_framework.test import APIClient
        from .models import PendingSetting, User

        user = User.objects.create_user(username='staff@x.ph', password='temp-pass-1', role='PERSONNEL', must_reset_password=True)
        client = APIClient()
        client.force_authenticate(user)
        with mock.patch('api.views.helpers.supabase_reachable', return_value=False):
            res = client.post('/api/auth/change-password/', {'new_password': 'Brand-new-pw-9'})
        self.assertEqual(res.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.check_password('Brand-new-pw-9'))
        self.assertFalse(user.must_reset_password)
        self.assertTrue(PendingSetting.objects.filter(model_label='api.User', obj_id=user.pk).exists())


class DailyTransactionLogTests(TestCase):
    def setUp(self):
        import tempfile
        from pathlib import Path
        from unittest import mock
        from . import daily_log
        self.daily_log = daily_log
        folder = Path(tempfile.mkdtemp())
        self.path = folder / 'daily_transactions.csv'
        self.latest = folder / 'daily_transactions_LATEST.csv'
        for name, path in (('LOG_PATH', self.path), ('LATEST_PATH', self.latest),
                           ('STATE_PATH', folder / 'daily_transactions.state')):
            patcher = mock.patch.object(daily_log, name, path)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.vehicle = Vehicle.objects.create(plate_number='ABC123')
        self.driver = Driver.objects.create(first_name='Juan', last_name='Cruz', contact='09170000000')

    def _rows(self, path=None):
        import csv
        with open(path or self.path, newline='', encoding='utf-8-sig') as f:
            return list(csv.reader(f))

    def _ticket(self, ticket_id='T1', **kw):
        return Ticket.objects.create(id=ticket_id, vehicle=self.vehicle, driver=self.driver, **kw)

    def test_checkin_row_is_closed_by_dispatch_not_duplicated(self):
        from django.utils import timezone
        t = self._ticket('Q-abc', status='QUEUED', queue_code='LVB-1', collection_amount=10)
        t.is_verified = True
        t.save()  # not a transaction
        rows = self._rows()
        self.assertEqual(len(rows), 2)  # header + the open visit
        self.assertEqual((rows[1][2], rows[1][3], rows[1][4], rows[1][9]), ('QUEUED', 'LVB-1', '', ''))
        # dispatch: placeholder deleted, real collected ticket(s) created
        t.delete()
        now = timezone.now()
        self._ticket('1001', status='COLLECTED', collection_amount=10, dispatched_at=now)
        self._ticket('1002', status='COLLECTED', collection_amount=10, dispatched_at=now)
        rows = self._rows()
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[1][2:5], ['COLLECTED', 'LVB-1', '1001, 1002'])
        self.assertEqual((rows[1][6], rows[1][7], rows[1][9]), ('ABC123', 'Cruz, Juan', '20'))
        self.assertTrue(rows[1][1])  # time out filled

    def test_cancel_closes_open_visit_and_roam_is_one_finished_row(self):
        from django.utils import timezone
        t = self._ticket('Q-abc', status='QUEUED')
        t.status = 'CANCELLED'
        t.save()
        self._ticket('2001', mode='UNLOAD', status='COLLECTED', collection_amount=10, dispatched_at=timezone.now())
        rows = self._rows()
        self.assertEqual([(r[2], r[4]) for r in rows[1:]], [('CANCELLED', ''), ('COLLECTED', '2001')])

    def test_new_day_wipes_file_but_untouched_file_keeps_old_rows(self):
        import os, time
        self._ticket('T1')
        yesterday = time.time() - 86400
        os.utime(self.path, (yesterday, yesterday))
        os.utime(self.path.with_name('daily_transactions.state'), (yesterday, yesterday))
        self.assertEqual(len(self._rows()), 2)  # nothing written yet -> yesterday's rows still readable
        self._ticket('T2')
        rows = self._rows()
        self.assertEqual([r[4] for r in rows[1:]], [''])
        self.assertEqual(len(rows), 2)

    @unittest.skipUnless(os.name == 'nt', "Windows-only: Excel's file lock")
    def test_locked_file_loses_nothing_and_catches_up_when_closed(self):
        other = Vehicle.objects.create(plate_number='XYZ789')
        self._ticket('T1', queue_code='A-1')
        with open(self.path):  # what Excel does: hold the file open
            Ticket.objects.create(id='T2', vehicle=other, driver=self.driver, queue_code='A-2')
            self.assertEqual(len(self._rows(self.path)), 2)  # main file untouched, still just T1
            self.assertEqual([r[3] for r in self._rows(self.latest)[1:]], ['A-1', 'A-2'])
        Ticket.objects.create(id='T3', vehicle=other, driver=self.driver, status='COLLECTED', collection_amount=10)
        self.assertEqual([(r[3], r[2]) for r in self._rows()[1:]], [('A-1', 'QUEUED'), ('A-2', 'COLLECTED')])
        self.assertFalse(self.latest.exists())

    def test_unwritable_log_does_not_block_ticket_creation(self):
        self.path.mkdir()  # main path can't be replaced
        self._ticket('T1')
        self.assertTrue(Ticket.objects.filter(pk='T1').exists())
        self.assertEqual(len(self._rows(self.latest)), 2)

    def test_backdated_backfill_is_not_logged(self):
        from datetime import timedelta
        from django.utils import timezone
        self._ticket('T1', status='COLLECTED', dispatched_at=timezone.now() - timedelta(days=3))
        self.assertFalse(self.path.exists())


class ExternalRemittanceTests(TestCase):
    URL = '/api/report/remittance/external/'

    def setUp(self):
        import tempfile
        from pathlib import Path
        from unittest import mock
        from django.utils import timezone
        from rest_framework.test import APIClient
        from . import daily_log
        from .models import Requisition, TicketForm, TicketSeries, User
        folder = Path(tempfile.mkdtemp())  # keep these test tickets out of the real daily log
        for name, path in (('LOG_PATH', folder / 'd.csv'), ('LATEST_PATH', folder / 'd_LATEST.csv'), ('STATE_PATH', folder / 'd.state')):
            patcher = mock.patch.object(daily_log, name, path)
            patcher.start()
            self.addCleanup(patcher.stop)
        form = TicketForm.objects.create(name='Std', price=10)
        self.series = TicketSeries.objects.create(
            series_no='S1', ticket_form=form, start_no='1', end_no='100', unit_value=0, requisition=Requisition.objects.create(),
        )
        vehicle = Vehicle.objects.create(plate_number='ABC123')
        driver = Driver.objects.create(first_name='Juan', last_name='Cruz', contact='09170000000')
        for n in range(1, 6):
            Ticket.objects.create(id=str(n), vehicle=vehicle, driver=driver, series=self.series, status='COLLECTED',
                                  is_verified=True, collection_amount=10, dispatched_at=timezone.now())
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_user(username='s', password='x', role='SUPERADMIN'))

    def _post(self, a, b, **kw):
        body = {'series': self.series.id, 'from_no': a, 'to_no': b, 'used_on': '2026-10-10', **kw}
        return self.client.post(self.URL, body, format='json')

    def test_preview_splits_system_and_paper_and_writes_nothing(self):
        from .models import PaperIssuance, RemittanceBatch
        res = self._post(1, 12)
        self.assertEqual((res.data['ticket_count'], res.data['total_amount']), (5, 50.0))
        self.assertEqual((res.data['paper_count'], res.data['paper_amount']), (7, 70.0))  # 6..12
        self.assertFalse(RemittanceBatch.objects.exists() or PaperIssuance.objects.exists())

    def test_commit_marks_system_tickets_and_records_paper_gap(self):
        from .models import PaperIssuance, RemittanceBatch
        res = self._post(1, 12, commit=True, reason='REMITTED_WITHOUT_SYSTEM')
        self.assertEqual(res.status_code, 200)
        batch = RemittanceBatch.objects.get()
        self.assertEqual((float(batch.total_amount), batch.deposits.count()), (50.0, 0))
        self.assertEqual(Ticket.objects.filter(remittance_batch=batch).count(), 5)
        self.assertEqual(Ticket.objects.count(), 5)  # nothing deleted
        col = batch.collections.get()
        self.assertEqual((col.from_no, col.to_no), ('1', '5'))
        paper = PaperIssuance.objects.get()
        self.assertEqual((paper.from_no, paper.to_no, paper.reason), (6, 12, 'REMITTED_WITHOUT_SYSTEM'))

    def test_numbers_between_system_tickets_become_separate_paper_runs(self):
        from .models import PaperIssuance
        Ticket.objects.filter(id='3').delete()  # 3 was never entered in the system
        self._post(1, 5, commit=True)
        self.assertEqual([(p.from_no, p.to_no) for p in PaperIssuance.objects.all()], [(3, 3)])

    def test_range_with_only_paper_numbers_works(self):
        from .models import RemittanceBatch
        res = self._post(10, 12, commit=True)
        self.assertEqual((res.data['ticket_count'], res.data['paper_count']), (0, 3))
        self.assertFalse(RemittanceBatch.objects.exists())

    def test_already_remitted_numbers_are_skipped_not_made_paper(self):
        self._post(1, 3, commit=True)
        res = self._post(1, 8)
        self.assertEqual((res.data['ticket_count'], res.data['paper_count'], res.data['skipped']), (2, 3, 3))

    def test_nothing_to_record_is_rejected(self):
        self._post(1, 5, commit=True)
        self.assertEqual(self._post(1, 5, commit=True).status_code, 400)

    def test_range_outside_series_is_rejected(self):
        self.assertEqual(self._post(90, 101).status_code, 400)

    def test_get_lists_series_with_unremitted_tickets(self):
        self._post(1, 2, commit=True)
        data = self.client.get(self.URL).data
        self.assertEqual((data[0]['series_no'], data[0]['count'], data[0]['first_no'], data[0]['last_no']), ('S1', 3, 3, 5))

    def test_paper_date_can_be_chosen(self):
        from .models import PaperIssuance
        self._post(1, 8, commit=True, used_on='2026-10-10')
        self.assertEqual(str(PaperIssuance.objects.get().used_on), '2026-10-10')

    def test_records_list_batches_and_paper(self):
        self._post(1, 8, commit=True)
        data = self.client.get(self.URL + 'records/').data
        self.assertEqual(len(data['batches']), 1)
        b = data['batches'][0]
        self.assertEqual((b['ticket_count'], b['total_amount'], b['from_no'], b['to_no']), (5, 50.0, '1', '5'))
        self.assertEqual([(p['from_no'], p['to_no'], p['count']) for p in data['paper']], [(6, 8, 3)])

    def test_undo_makes_tickets_unremitted_again(self):
        from .models import RemittanceBatch
        self._post(1, 3, commit=True)
        batch = RemittanceBatch.objects.get()
        self.assertEqual(self.client.delete(f'{self.URL}{batch.id}/').status_code, 204)
        self.assertFalse(RemittanceBatch.objects.exists())
        self.assertFalse(Ticket.objects.filter(remittance_batch__isnull=False).exists())
        self.assertEqual(Ticket.objects.count(), 5)
        self.assertEqual(self._post(1, 3).data['ticket_count'], 3)  # can be marked again

    def test_undo_refuses_real_remittances(self):
        from .models import RemittanceBatch
        real = RemittanceBatch.objects.create(batch_code='B-1', total_amount=10)
        self.assertEqual(self.client.delete(f'{self.URL}{real.id}/').status_code, 400)
        self.assertTrue(RemittanceBatch.objects.filter(pk=real.pk).exists())

    def test_next_free_skips_system_and_paper_numbers(self):
        self._post(10, 12, commit=True)  # paper 10-12
        data = self.client.get(self.URL).data
        self.assertEqual(data[0]['next_free'], 6)  # tickets 1-5 are used; 10-12 don't matter yet
        self._post(6, 9, commit=True)
        self.assertEqual(self.client.get(self.URL).data[0]['next_free'], 13)

    def test_future_paper_date_is_rejected(self):
        from .models import PaperIssuance
        res = self._post(1, 8, commit=True, used_on='2999-01-01')
        self.assertEqual(res.status_code, 400)
        self.assertFalse(PaperIssuance.objects.exists())

    def test_paper_date_is_required_only_with_paper_tickets(self):
        self.assertEqual(self._post(1, 8, commit=True, used_on=None).status_code, 400)
        self.assertEqual(self._post(1, 5, commit=True, used_on=None).status_code, 200)  # system tickets only


class AutoBackupSettingsTests(TestCase):
    URL = '/api/system/backups/settings/'

    def setUp(self):
        from rest_framework.test import APIClient
        from .models import User
        self.user = User.objects.create_user(username='root', password='x', role='SUPERADMIN')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def _backup(self, source, label, age_days):
        from datetime import timedelta
        from django.utils import timezone
        from .models import BackupRecord
        rec = BackupRecord.objects.create(filename=f'backup_{source}_{age_days}.json', label=label, source=source)
        BackupRecord.objects.filter(pk=rec.pk).update(created_at=timezone.now() - timedelta(days=age_days))
        return rec

    def test_defaults_and_update(self):
        self.assertEqual(self.client.get(self.URL).data, {'enabled': True, 'interval_days': 1, 'keep_days': 28})
        res = self.client.put(self.URL, {'interval_days': 3, 'keep_days': 7}, format='json')
        self.assertEqual((res.data['interval_days'], res.data['keep_days']), (3, 7))

    def test_rejects_out_of_range(self):
        self.assertEqual(self.client.put(self.URL, {'interval_days': 0}, format='json').status_code, 400)
        self.assertEqual(self.client.put(self.URL, {'keep_days': 9999}, format='json').status_code, 400)

    def test_settings_survive_restore(self):
        from .models import BackupSettings
        from .views.system import _backup_models
        self.assertNotIn(BackupSettings, _backup_models())

    def test_expiry_drops_old_automatic_but_never_manual(self):
        from unittest import mock
        from .auto_backup import _run_once
        from .models import BackupRecord, BackupSettings
        from .views.system import SCHEDULED_LABEL
        BackupSettings.objects.create(pk=1, keep_days=7)
        fresh = self._backup('AUTO', SCHEDULED_LABEL, 0)
        old_auto = self._backup('AUTO', 'Pre-restore snapshot', 10)
        old_manual = self._backup('MANUAL', 'Before payroll', 100)
        with mock.patch('api.views.system.backup_storage'):
            _run_once()
        self.assertEqual(set(BackupRecord.objects.values_list('pk', flat=True)), {fresh.pk, old_manual.pk})
        self.assertFalse(BackupRecord.objects.filter(pk=old_auto.pk).exists())

    def test_disabled_makes_no_backup(self):
        from unittest import mock
        from .auto_backup import _run_once
        from .models import BackupRecord, BackupSettings
        BackupSettings.objects.create(pk=1, enabled=False)
        with mock.patch('api.views.system._create_backup_file') as make:
            _run_once()
        make.assert_not_called()
        self.assertFalse(BackupRecord.objects.exists())


class RequisitionRequesterTests(TestCase):
    def setUp(self):
        from rest_framework.test import APIClient
        from .models import User
        self.sup = User.objects.create_user(username='sup@x.com', password='x', role='SUPERVISOR', first_name='Sam', last_name='Sup')
        self.admin = User.objects.create_user(username='admin@x.com', password='x', role='SUPERADMIN', first_name='Ada', last_name='Min')
        self.client = APIClient()

    def _create(self, user, requested_by):
        self.client.force_authenticate(user)
        return self.client.post('/api/requisitions/', {'total_value': 0, 'requested_by': requested_by}, format='json')

    def test_requester_is_the_chosen_supervisor_and_issuer_is_the_logged_in_user(self):
        res = self._create(self.admin, self.sup.id)
        self.assertEqual(res.status_code, 201)
        self.assertEqual((res.data['requested_by_name'], res.data['issued_by_name']), ('Sam Sup', 'Ada Min'))

    def test_supervisor_can_request_and_issue_their_own(self):
        res = self._create(self.sup, self.sup.id)
        self.assertEqual((res.data['requested_by_name'], res.data['issued_by_name']), ('Sam Sup', 'Sam Sup'))

    def test_requester_is_required_and_must_be_a_supervisor(self):
        self.assertEqual(self._create(self.admin, None).status_code, 400)
        self.assertEqual(self._create(self.admin, self.admin.id).status_code, 400)

    def test_supervisor_list_is_open_to_non_admins(self):
        from .models import User
        self.client.force_authenticate(User.objects.create_user(username='p@x.com', password='x', role='PERSONNEL'))
        res = self.client.get('/api/supervisors/')
        self.assertEqual([s['name'] for s in res.data], ['Sam Sup'])


class RemittancePreparedByTests(TestCase):
    URL = '/api/report/remittance/'

    def setUp(self):
        from rest_framework.test import APIClient
        from .models import User
        self.sup = User.objects.create_user(username='sup@x.com', password='x', role='SUPERVISOR', first_name='Sam', last_name='Sup')
        self.staff = User.objects.create_user(username='p@x.com', password='x', role='PERSONNEL', first_name='Pat', last_name='Staff')
        self.client = APIClient()
        self.client.force_authenticate(self.staff)

    def _post(self, prepared_by):
        return self.client.post(self.URL, {'id': 'TER-1', 'total_amount': 0, 'prepared_by': prepared_by}, format='json')

    def test_batch_records_the_supervisor_and_who_keyed_it_in(self):
        from .models import RemittanceBatch
        self.assertEqual(self._post(self.sup.id).status_code, 201)
        batch = RemittanceBatch.objects.get()
        self.assertEqual((batch.prepared_by_name, batch.issued_by), ('Sam Sup', self.staff))
        listed = self.client.get(self.URL).data['results'][0]
        self.assertEqual((listed['prepared_by_name'], listed['issued_by_name']), ('Sam Sup', 'Pat Staff'))

    def test_preparer_is_required_and_must_be_a_supervisor(self):
        from .models import RemittanceBatch
        for bad in (None, '', 'abc', self.staff.id, 9999):
            self.assertEqual(self._post(bad).status_code, 400, bad)
        self.assertFalse(RemittanceBatch.objects.exists())


class OneRemittancePerDayTests(TestCase):
    URL = '/api/report/remittance/'

    def setUp(self):
        from rest_framework.test import APIClient
        from .models import User
        self.sup = User.objects.create_user(username='sup@x.com', password='x', role='SUPERVISOR', first_name='Sam', last_name='Sup')
        self.client = APIClient()
        self.client.force_authenticate(self.sup)

    def _body(self, code, day, amount=100, **extra):
        return {'id': code, 'prepared_by': self.sup.id, 'covers_date': day, 'total_amount': amount,
                'collections': [{'ticketFormNo': 'Std', 'from': 500, 'to': 400, 'amount': amount}],
                'deposits': [{'type': 'bill', 'denomination': 100, 'quantity': amount // 100, 'depositAmount': amount}], **extra}

    def test_second_batch_for_the_same_day_is_refused(self):
        from .models import RemittanceBatch
        self.assertEqual(self.client.post(self.URL, self._body('TER-1', '2026-10-19'), format='json').status_code, 201)
        res = self.client.post(self.URL, self._body('TER-1-2', '2026-10-19'), format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('TER-1', str(res.data))
        self.assertEqual(self.client.post(self.URL, self._body('TER-2', '2026-10-20'), format='json').status_code, 201)
        self.assertEqual(RemittanceBatch.objects.count(), 2)

    def test_outside_remittance_does_not_block_the_day(self):
        from .models import RemittanceBatch
        RemittanceBatch.objects.create(batch_code='EXT-1', covers_date='2026-10-19', total_amount=50)
        self.assertEqual(self.client.post(self.URL, self._body('TER-1', '2026-10-19'), format='json').status_code, 201)

    def test_amend_replaces_lines_and_total_keeping_the_code(self):
        from .models import Collection, Deposit, RemittanceBatch
        self.client.post(self.URL, self._body('TER-1', '2026-10-19'), format='json')
        batch = RemittanceBatch.objects.get()
        res = self.client.post(f'{self.URL}{batch.id}/amend/', self._body('ignored', '2026-10-19', amount=300), format='json')
        self.assertEqual(res.status_code, 200)
        batch.refresh_from_db()
        self.assertEqual((batch.batch_code, float(batch.total_amount)), ('TER-1', 300.0))
        self.assertEqual([float(c.amount) for c in Collection.objects.filter(batch=batch)], [300.0])
        self.assertEqual([d.quantity for d in Deposit.objects.filter(batch=batch)], [3])

    def test_amend_refuses_outside_and_archived_batches(self):
        from .models import RemittanceBatch
        ext = RemittanceBatch.objects.create(batch_code='EXT-1', covers_date='2026-10-19', total_amount=50)
        arch = RemittanceBatch.objects.create(batch_code='TER-9', covers_date='2026-10-18', total_amount=50, is_archived=True)
        for b in (ext, arch):
            self.assertEqual(self.client.post(f'{self.URL}{b.id}/amend/', self._body('x', '2026-10-19'), format='json').status_code, 400)


class KioskTests(TestCase):
    def setUp(self):
        from unittest import mock
        from rest_framework.test import APIClient
        from .models import Requisition, Route, TicketForm, TicketSeries, User
        for target in ('api.serializers.send_sms_async', 'api.views.viewsets.send_sms_async'):
            patcher = mock.patch(target)
            patcher.start()
            self.addCleanup(patcher.stop)

        route = Route.objects.create(origin='Bacnotan')
        puv = PUVType.objects.create(name='Jeep', terminal_price=10)
        self.a = Vehicle.objects.create(plate_number='AAA111', qr_code='QR-A', route=route, transportation_id=puv)
        self.b = Vehicle.objects.create(plate_number='BBB222', qr_code='QR-B', route=route, transportation_id=puv)
        self.d1 = Driver.objects.create(first_name='Ana', last_name='Cruz', contact='09170000001')
        self.d2 = Driver.objects.create(first_name='Ben', last_name='Diaz', contact='09170000002')
        self.series = TicketSeries.objects.create(
            series_no='S1', ticket_form=TicketForm.objects.create(name='Std', price=10),
            start_no='1', end_no='100', unit_value=0, requisition=Requisition.objects.create(),
        )
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_user(username='cashier', password='x', role='SUPERADMIN'))

    def _scan(self, text):
        return self.client.post('/api/kiosk/scan/', {'text': text}, format='json').data

    def _check_in(self, vehicle, driver, mode):
        return self.client.post('/api/kiosk/check-in/', {
            'vehicle_id': vehicle.id, 'driver_id': driver.id, 'mode': mode,
        }, format='json').data

    def _pay(self, vehicle, quantity=1):
        return self.client.post('/api/kiosk/mark-paid/', {
            'vehicle_id': vehicle.id, 'series_id': self.series.id, 'quantity': quantity,
        }, format='json')

    def test_unknown_qr(self):
        self.assertEqual(self._scan('nope')['state'], 'UNKNOWN')

    def test_queue_visit_must_be_paid_before_checkout(self):
        scan = self._scan('QR-A')
        self.assertEqual(scan['state'], 'CHECK_IN')
        self.assertEqual({d['name'] for d in scan['drivers']}, {'Cruz, Ana', 'Diaz, Ben'})

        self.assertEqual(self._check_in(self.a, self.d1, 'QUEUE')['state'], 'CHECKED_IN')
        self.a.refresh_from_db()
        self.assertEqual(self.a.status, 'QUEUED')

        self.assertEqual(self._scan('QR-A')['state'], 'AWAITING_PAYMENT')  # unpaid: no checkout
        placeholder = Ticket.objects.get(vehicle=self.a, status='QUEUED')
        checked_in = placeholder.issued_at

        self.assertEqual(self._pay(self.a).status_code, 200)
        out = self._scan('QR-A')
        self.assertEqual(out['state'], 'DEPARTED')
        self.a.refresh_from_db()
        self.assertEqual(self.a.status, 'AVAILABLE')
        ticket = Ticket.objects.get(id=out['tickets'][0])
        self.assertEqual((ticket.status, ticket.mode, ticket.collection_amount), ('COLLECTED', 'QUEUE', 10))
        # The dispatched ticket is brand new, but keeps the real arrival time for the stay.
        self.assertEqual(ticket.checked_in_at, checked_in)
        self.assertGreaterEqual(ticket.dispatched_at, ticket.checked_in_at)
        self.assertEqual(self._scan('QR-A')['state'], 'CHECK_IN')  # visit is over

    def test_paid_vehicle_waits_for_its_turn(self):
        self._check_in(self.a, self.d1, 'QUEUE')
        self._check_in(self.b, self.d2, 'QUEUE')
        self._pay(self.b)
        waiting = self._scan('QR-B')
        self.assertEqual((waiting['state'], waiting['position']), ('WAIT_TURN', 2))
        self.assertTrue(Ticket.objects.filter(vehicle=self.b, status='QUEUED').exists())

    def test_roam_visit_pays_then_checks_out(self):
        self.assertEqual(self._check_in(self.a, self.d1, 'ROAM')['state'], 'CHECKED_IN')
        self.assertFalse(Ticket.objects.exists())  # nothing issued before payment
        self.assertEqual(self._scan('QR-A')['state'], 'AWAITING_PAYMENT')
        pending = self.client.get('/api/kiosk/sessions/').data
        self.assertEqual([(s['plate'], s['mode'], s['status']) for s in pending], [('AAA111', 'ROAM', 'AWAITING_PAYMENT')])

        self._pay(self.a)
        out = self._scan('QR-A')
        self.assertEqual(out['state'], 'DEPARTED')
        ticket = Ticket.objects.get(id=out['tickets'][0])
        self.assertEqual((ticket.status, ticket.mode), ('COLLECTED', 'UNLOAD'))
        # A kiosk roam's stay runs from its check-in scan to checkout.
        self.assertLess(ticket.checked_in_at, ticket.dispatched_at)
        self.assertEqual(self.client.get('/api/kiosk/sessions/').data, [])

    def test_front_desk_queued_vehicle_can_be_marked_paid(self):
        self.client.post('/api/tickets/', {
            'id': 'Q-x', 'vehicle_id': self.a.id, 'driver_id': self.d1.id, 'route': self.a.route_id,
            'status': 'QUEUED', 'mode': 'QUEUE', 'is_verified': False,
        }, format='json')
        self.assertEqual(self._scan('QR-A')['state'], 'AWAITING_PAYMENT')
        self._pay(self.a)
        self.assertEqual(self._scan('QR-A')['state'], 'DEPARTED')

    def test_mark_paid_total_must_match_terminal_price_and_can_be_undone(self):
        self._check_in(self.a, self.d1, 'ROAM')
        self.assertEqual(self._pay(self.a, quantity=2).status_code, 400)
        self._pay(self.a)
        self.client.post('/api/kiosk/mark-paid/', {'vehicle_id': self.a.id, 'paid': False}, format='json')
        self.assertEqual(self._scan('QR-A')['state'], 'AWAITING_PAYMENT')

    def test_driver_cannot_check_in_twice_and_cancelled_roam_frees_the_vehicle(self):
        self._check_in(self.a, self.d1, 'ROAM')
        self.assertEqual(self._check_in(self.b, self.d1, 'QUEUE')['state'], 'ERROR')
        self.client.post('/api/kiosk/cancel/', {'vehicle_id': self.a.id}, format='json')
        self.assertEqual(self._scan('QR-A')['state'], 'CHECK_IN')
