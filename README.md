# Menu Vologda

Интерактивное анонимное голосование за закуски для корпоратива.

## Что уже реализовано

- карточки закусок по 2 в ряд;
- выбор до 10 позиций;
- счётчик выбранного;
- cookie + localStorage защита от повторного голосования;
- серверная уникальность device-id;
- финальный экран с конфетти, бокалами и таймером до 10 октября 2026, 17:00 (UTC+3);
- отдельная `/admin.html`;
- админка только по паролю;
- промежуточные результаты, ТОП-10, полный рейтинг;
- открытие/закрытие голосования;
- Supabase backend через RPC без прямого доступа к таблицам;
- адаптивный mobile-first дизайн.

## Файлы

- `index.html` — голосование;
- `admin.html` — админка;
- `snacks.js` — список закусок;
- `config.js` — URL и publishable/anon key Supabase;
- `supabase/schema.sql` — схема базы и защищённые функции.

## Backend

1. Создать отдельный Supabase project.
2. Применить `supabase/schema.sql`.
3. Установить пароль администратора только в базе:

```sql
update public.vote_settings
set admin_password_hash = crypt('YOUR_STRONG_PASSWORD', gen_salt('bf'))
where id = 1;
```

4. Вставить `SUPABASE_URL` и publishable/anon key в `config.js`.

Пароль администратора не должен попадать в GitHub.
