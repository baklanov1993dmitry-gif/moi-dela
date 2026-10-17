package com.moidela.app;

import android.app.job.JobParameters;
import android.app.job.JobService;

public class SyncJob extends JobService {
    @Override public boolean onStartJob(final JobParameters p) {
        new Thread(new Runnable() { public void run() { Sync.run(getApplicationContext()); jobFinished(p, false); } }).start();
        return true;
    }
    @Override public boolean onStopJob(JobParameters p) { return true; }
}
