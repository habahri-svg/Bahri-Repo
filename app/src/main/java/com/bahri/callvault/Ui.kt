package com.bahri.callvault

import android.content.Context
import android.util.TypedValue
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import java.text.DateFormat
import java.util.Date

fun Context.dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

fun Context.label(text: String, size: Float = 15f, bold: Boolean = false) = TextView(this).apply {
    this.text = text
    textSize = size
    if (bold) setTypeface(typeface, android.graphics.Typeface.BOLD)
    setPadding(0, dp(6), 0, dp(6))
}

fun Context.button(text: String, onClick: () -> Unit) = Button(this).apply {
    this.text = text
    isAllCaps = false
    setOnClickListener { onClick() }
}

fun Context.column(pad: Int = 16) = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    setPadding(dp(pad), dp(pad), dp(pad), dp(pad))
    layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
}

fun View.show(v: Boolean) { visibility = if (v) View.VISIBLE else View.GONE }

fun fmtDate(ms: Long): String = DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(ms))
fun fmtDur(ms: Long): String = "%d:%02d".format(ms / 60000, (ms / 1000) % 60)
