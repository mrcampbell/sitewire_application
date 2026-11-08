export const HomePage = () => (
  <section class="space-y-6">
    <h1 class="text-3xl font-bold">Users</h1>

    <div class="stats bg-base-100 shadow">
      <div class="stat">
        <div class="stat-title">Total users</div>
        <div class="stat-value">—</div>
      </div>
    </div>

    <div class="overflow-x-auto rounded-box bg-base-100 shadow">
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Email</th>
            <th>Last login</th>
            <th>IP address</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  </section>
);
